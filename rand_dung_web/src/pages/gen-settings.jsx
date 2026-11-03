import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { auth, db } from "@/App.jsx";
import { RandomWalkSettings } from "@/components/random-walk-settings";
import { RequireVerifiedUser } from "@/components/require-verified-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function normalizeGenerationType(value) {
    return typeof value === "string"
        ? value.trim().toLowerCase().replace(/[-_]+/g, " ")
        : "";
}

const GENERATION_SETTINGS_COMPONENTS = {
    "random walk": RandomWalkSettings,
};

const RANDOM_WALK_SETTING_MINIMUMS = {
    grid_width: 2,
    grid_height: 2,
    max_tunnels: 1,
    max_tunnel_length: 1,
};

const EMPTY_RANDOM_WALK_SETTINGS = {
    grid_width: "",
    grid_height: "",
    max_tunnels: "",
    max_tunnel_length: "",
};

function getSettingsComponent(generationTypeId, generationType) {
    const normalizedId = normalizeGenerationType(generationTypeId);
    const normalizedName = normalizeGenerationType(generationType?.name);

    return GENERATION_SETTINGS_COMPONENTS[normalizedId]
        ?? GENERATION_SETTINGS_COMPONENTS[normalizedName]
        ?? null;
}

function isRandomWalkGeneration(generationTypeId, generationType) {
    return normalizeGenerationType(generationTypeId) === "random walk"
        || normalizeGenerationType(generationType?.name) === "random walk";
}

function getRandomWalkSettingsValues(data = {}) {
    return Object.fromEntries(
        Object.keys(EMPTY_RANDOM_WALK_SETTINGS).map((key) => [
            key,
            data[key] === null || data[key] === undefined ? "" : String(data[key]),
        ]),
    );
}

function parseRandomWalkSettings(values) {
    return Object.fromEntries(
        Object.keys(RANDOM_WALK_SETTING_MINIMUMS).map((key) => [key, Number(values[key])]),
    );
}

function isValidRandomWalkSettings(values) {
    return Object.entries(RANDOM_WALK_SETTING_MINIMUMS).every(([key, minimum]) => {
        const value = values[key];
        return value.trim() !== ""
            && Number.isSafeInteger(Number(value))
            && Number(value) >= minimum;
    });
}

function GenerationSettingsContent({ projectName, selectedGenerationTypeId }) {
    const [projectState, setProjectState] = useState({ status: "loading" });
    const [generationState, setGenerationState] = useState({ status: "loading" });
    const [randomWalkSettings, setRandomWalkSettings] = useState(EMPTY_RANDOM_WALK_SETTINGS);
    const [settingsLoadStatus, setSettingsLoadStatus] = useState("loading");
    const [settingsSaveStatus, setSettingsSaveStatus] = useState("idle");

    useEffect(() => {
        let active = true;

        async function loadProject() {
            const uid = auth.currentUser?.uid;
            if (!uid) {
                if (active) setProjectState({ status: "error" });
                return;
            }

            try {
                const projectSnapshot = await getDoc(doc(db, `users/${uid}/projects/${projectName}`));
                if (active) {
                    setProjectState(projectSnapshot.exists()
                        ? { status: "found", project: projectSnapshot.data() }
                        : { status: "not-found" });
                }
            } catch {
                if (active) setProjectState({ status: "error" });
            }
        }

        loadProject();
        return () => {
            active = false;
        };
    }, [projectName]);

    useEffect(() => {
        if (projectState.status !== "found") return undefined;

        let active = true;

        async function loadGenerationType() {
            const generationTypeId = selectedGenerationTypeId
                || projectState.project["gen-type"]
                || projectState.project.generationTypeId
                || projectState.project.generationType;

            if (!generationTypeId || generationTypeId === "none") {
                if (active) setGenerationState({ status: "not-found" });
                return;
            }

            try {
                const snapshot = await getDocs(collection(db, "generation"));
                const generationType = snapshot.docs.find((generationDoc) =>
                    generationDoc.id === generationTypeId || generationDoc.data().name === generationTypeId);

                if (active) {
                    setGenerationState(generationType
                        ? {
                            status: "found",
                            id: generationType.id,
                            generationType: generationType.data(),
                        }
                        : { status: "not-found" });
                }
            } catch {
                if (active) setGenerationState({ status: "error" });
            }
        }

        loadGenerationType();
        return () => {
            active = false;
        };
    }, [projectState, selectedGenerationTypeId]);

    useEffect(() => {
        if (generationState.status !== "found"
            || !isRandomWalkGeneration(generationState.id, generationState.generationType)) {
            return undefined;
        }

        let active = true;
        setSettingsLoadStatus("loading");

        async function loadRandomWalkSettings() {
            try {
                const uid = auth.currentUser?.uid;
                if (!uid) throw new Error("No signed-in user");

                const settingsSnapshot = await getDoc(
                    doc(db, `users/${uid}/projects/${projectName}/gen-settings/settings`),
                );
                const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};

                if (active) {
                    setRandomWalkSettings(getRandomWalkSettingsValues(settings));
                    setSettingsLoadStatus("loaded");
                    setSettingsSaveStatus("idle");
                }
            } catch {
                if (active) setSettingsLoadStatus("error");
            }
        }

        loadRandomWalkSettings();
        return () => {
            active = false;
        };
    }, [generationState, projectName]);

    const randomWalkSettingsValid = isValidRandomWalkSettings(randomWalkSettings);

    async function saveRandomWalkSettings() {
        if (!randomWalkSettingsValid || settingsLoadStatus !== "loaded") return;

        setSettingsSaveStatus("saving");
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) throw new Error("No signed-in user");

            await setDoc(
                doc(db, `users/${uid}/projects/${projectName}/gen-settings/settings`),
                parseRandomWalkSettings(randomWalkSettings),
                { merge: true },
            );
            setSettingsSaveStatus("saved");
        } catch {
            setSettingsSaveStatus("error");
        }
    }

    if (projectState.status === "not-found" || projectState.status === "error"
        || generationState.status === "not-found" || generationState.status === "error") {
        return <Navigate to="/dashboard" replace />;
    }

    const project = projectState.project;
    const projectTitle = project?.title ?? projectName;
    const projectDescription = projectState.status === "loading"
        ? "Loading project…"
        : projectState.status === "error"
            ? "Unable to load this project. Please try again."
            : project.description;

    const generationType = generationState.generationType;
    const generationTitle = projectState.status === "error"
        ? "Unable to load generation type"
        : generationState.status === "loading"
            ? "Loading generation type…"
            : generationState.status === "not-found"
                ? "Generation type not found"
                : generationState.status === "error"
                    ? "Unable to load generation type"
                    : generationType.name ?? generationState.id;
    const SettingsComponent = generationState.status === "found"
        ? getSettingsComponent(generationState.id, generationType)
        : null;

    return (
        <div className="w-full flex flex-col items-center gap-6 p-10">
            <Card className="w-full max-w-xl p-5">
                <CardHeader>
                    <CardTitle>{projectTitle}</CardTitle>
                    <CardDescription>{projectDescription}</CardDescription>
                </CardHeader>
            </Card>
            <Card className="w-full max-w-xl p-5">
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                </CardHeader>
                <CardContent>
                    {generationState.status === "loading" ? (
                        <CardDescription>Loading settings…</CardDescription>
                    ) : SettingsComponent ? (
                        <>
                            <SettingsComponent
                                generationType={generationType}
                                projectName={projectName}
                                values={randomWalkSettings}
                                onChange={(values) => {
                                    setRandomWalkSettings(values);
                                    setSettingsSaveStatus("idle");
                                }}
                                disabled={settingsLoadStatus !== "loaded"}
                            />
                            {SettingsComponent === RandomWalkSettings && (
                                <div className="mt-6 flex flex-col items-start gap-3">
                                    {settingsLoadStatus === "loading" && (
                                        <CardDescription>Loading saved settings…</CardDescription>
                                    )}
                                    {settingsLoadStatus === "error" && (
                                        <CardDescription role="alert">
                                            Unable to load saved settings. Please try again.
                                        </CardDescription>
                                    )}
                                    <Button
                                        disabled={!randomWalkSettingsValid || settingsLoadStatus !== "loaded" || settingsSaveStatus === "saving"}
                                        onClick={saveRandomWalkSettings}
                                    >
                                        {settingsSaveStatus === "saving" ? "Saving…" : "Save"}
                                    </Button>
                                    {settingsSaveStatus === "saved" && (
                                        <CardDescription role="status">Settings saved.</CardDescription>
                                    )}
                                    {settingsSaveStatus === "error" && (
                                        <CardDescription role="alert">
                                            Unable to save settings. Please try again.
                                        </CardDescription>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <CardDescription>
                            Settings for {generationTitle} are not available yet.
                        </CardDescription>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export function GenerationSettings({ user, authLoading }) {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const projectName = searchParams.get("project");
    const selectedGenerationTypeId = location.state?.generationTypeId;

    if (!projectName?.trim()) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <RequireVerifiedUser user={user} authLoading={authLoading}>
            <GenerationSettingsContent
                projectName={projectName}
                selectedGenerationTypeId={selectedGenerationTypeId}
            />
        </RequireVerifiedUser>
    );
}
