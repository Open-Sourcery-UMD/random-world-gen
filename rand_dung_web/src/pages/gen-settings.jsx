import { useEffect, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { AlertCircle, Grid3X3, LoaderCircle, Play } from "lucide-react";
import { auth, db } from "@/App.jsx";
import { RandomWalkSettings } from "@/components/random-walk-settings";
import { DungeonMapPreview } from "@/components/dungeon-map-preview";
import { RequireVerifiedUser } from "@/components/require-verified-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RANDOM_WALK_API_URL = (import.meta.env.VITE_RANDOM_WALK_API_URL ?? "").replace(/\/+$/, "");

function normalizeGenerationType(value) {
    return typeof value === "string"
        ? value.trim().toLowerCase().replace(/[-_]+/g, " ")
        : "";
}

const GENERATION_SETTINGS_COMPONENTS = {
    "random walk": RandomWalkSettings,
};

const RANDOM_WALK_SETTING_LIMITS = {
    grid_width: { min: 2, max: 200 },
    grid_height: { min: 2, max: 200 },
    max_tunnels: { min: 1, max: 500 },
    max_tunnel_length: { min: 1, max: 200 },
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
        Object.keys(RANDOM_WALK_SETTING_LIMITS).map((key) => [key, Number(values[key])]),
    );
}

function isValidRandomWalkSettings(values) {
    return Object.entries(RANDOM_WALK_SETTING_LIMITS).every(([key, { min, max }]) => {
        const value = values[key];
        return value.trim() !== ""
            && Number.isSafeInteger(Number(value))
            && Number(value) >= min
            && Number(value) <= max;
    });
}

function isValidRandomWalkResponse(data, expectedSettings) {
    if (!data || typeof data !== "object" || Array.isArray(data)
        || data.algorithm !== "random_walk"
        || !Number.isSafeInteger(data.seed)
        || data.seed < 0
        || data.seed > 2_147_483_647) {
        return false;
    }

    const map = data.map;
    if (!map || typeof map !== "object" || Array.isArray(map)
        || map.width !== expectedSettings.grid_width
        || map.height !== expectedSettings.grid_height
        || !Array.isArray(map.cells)
        || map.cells.length !== map.height) {
        return false;
    }

    return map.cells.every((row) => Array.isArray(row)
        && row.length === map.width
        && row.every((cell) => cell === 0 || cell === 1));
}

function GenerationSettingsContent({ projectName, selectedGenerationTypeId }) {
    const [projectState, setProjectState] = useState({ status: "loading" });
    const [generationState, setGenerationState] = useState({ status: "loading" });
    const [randomWalkSettings, setRandomWalkSettings] = useState(EMPTY_RANDOM_WALK_SETTINGS);
    const [settingsLoadStatus, setSettingsLoadStatus] = useState("loading");
    const [settingsSaveStatus, setSettingsSaveStatus] = useState("idle");
    const [algorithmTestState, setAlgorithmTestState] = useState({ status: "idle" });

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
    const algorithmTestLoading = algorithmTestState.status === "loading";

    async function saveRandomWalkSettings() {
        if (!randomWalkSettingsValid || settingsLoadStatus !== "loaded" || algorithmTestLoading) return;

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

    async function testRandomWalkAlgorithm() {
        if (!randomWalkSettingsValid || settingsLoadStatus !== "loaded" || algorithmTestLoading) return;

        if (!RANDOM_WALK_API_URL) {
            setAlgorithmTestState({
                status: "error",
                message: "The generator API URL is not configured. Set VITE_RANDOM_WALK_API_URL to your Render service URL.",
            });
            return;
        }

        const settings = parseRandomWalkSettings(randomWalkSettings);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        setAlgorithmTestState({ status: "loading" });

        try {
            const response = await fetch(RANDOM_WALK_API_URL + "/api/v1/generate", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    algorithm: "random_walk",
                    settings,
                }),
                signal: controller.signal,
            });

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().includes("application/json")) {
                if (response.status === 503) {
                    throw new Error("The generator may be waking up on Render. Please try again in a moment.");
                }
                throw new Error("The generator returned a non-JSON response.");
            }

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("The generator returned malformed JSON.");
            }

            if (!response.ok) {
                throw new Error(
                    typeof data?.message === "string"
                        ? data.message
                        : "The generator request failed with status " + response.status + ".",
                );
            }

            if (!isValidRandomWalkResponse(data, settings)) {
                throw new Error("The generator response did not contain a valid dungeon map.");
            }

            setAlgorithmTestState({ status: "success", result: data });
        } catch (error) {
            const message = error?.name === "AbortError"
                ? "The generator took too long to respond. Please try again."
                : error instanceof TypeError
                    ? "Could not reach the generator. Check the Render URL and CORS settings."
                    : error?.message ?? "The dungeon could not be generated.";

            setAlgorithmTestState({ status: "error", message });
        } finally {
            clearTimeout(timeout);
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
                                    setAlgorithmTestState({ status: "idle" });
                                }}
                                disabled={settingsLoadStatus !== "loaded" || algorithmTestLoading}
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
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button
                                            disabled={!randomWalkSettingsValid || settingsLoadStatus !== "loaded" || settingsSaveStatus === "saving" || algorithmTestLoading}
                                            onClick={saveRandomWalkSettings}
                                        >
                                            {settingsSaveStatus === "saving" ? "Saving…" : "Save"}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={!randomWalkSettingsValid || settingsLoadStatus !== "loaded" || settingsSaveStatus === "saving" || algorithmTestLoading}
                                            onClick={testRandomWalkAlgorithm}
                                        >
                                            {algorithmTestLoading ? (
                                                <>
                                                    <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                                    Generating…
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="size-4" aria-hidden="true" />
                                                    Test algorithm
                                                </>
                                            )}
                                        </Button>
                                    </div>
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
            {SettingsComponent === RandomWalkSettings && (
                <Card className="w-full max-w-3xl p-5">
                    <CardHeader>
                        <CardTitle>Output</CardTitle>
                        <CardDescription>
                            Preview the dungeon generated with the current settings.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {algorithmTestState.status === "idle" && (
                            <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
                                <Grid3X3 className="size-8 text-muted-foreground" aria-hidden="true" />
                                <CardDescription>
                                    Your dungeon preview will appear here after you test the algorithm.
                                </CardDescription>
                            </div>
                        )}
                        {algorithmTestLoading && (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted/30 px-6 py-8 text-center" role="status" aria-live="polite">
                                <LoaderCircle className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">Generating your dungeon…</p>
                                    <CardDescription>
                                        The Render service may take a little longer if it is waking up.
                                    </CardDescription>
                                </div>
                                <div className="grid w-full max-w-sm grid-cols-8 gap-1" aria-hidden="true">
                                    {Array.from({ length: 32 }, (_, index) => (
                                        <span
                                            key={index}
                                            className="aspect-square rounded-sm bg-muted-foreground/15 animate-pulse motion-reduce:animate-none"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {algorithmTestState.status === "error" && (
                            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                <p>{algorithmTestState.message}</p>
                            </div>
                        )}
                        {algorithmTestState.status === "success" && (
                            <div className="flex flex-col items-center gap-4" aria-live="polite">
                                <DungeonMapPreview map={algorithmTestState.result.map} />
                                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="size-3 rounded-sm border border-slate-700 bg-slate-950" aria-hidden="true" />
                                            Wall
                                        </span>
                                        <span className="inline-flex items-center gap-2">
                                            <span className="size-3 rounded-sm bg-amber-300" aria-hidden="true" />
                                            Passage
                                        </span>
                                    </div>
                                    <CardDescription>
                                        {algorithmTestState.result.map.width} × {algorithmTestState.result.map.height}
                                        {" · "}Seed {algorithmTestState.result.seed}
                                    </CardDescription>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
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
