import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "@/App.jsx";
import { RequireVerifiedUser } from "@/components/require-verified-user";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRMATION_PHRASE = "delete my data";

function normalizeGenerationType(value) {
    return typeof value === "string"
        ? value.trim().toLowerCase().replace(/[-_]+/g, " ")
        : "";
}

function getGenerationTypeLabel(type) {
    if (normalizeGenerationType(type.name) === "random walk"
        || normalizeGenerationType(type.id) === "random walk") {
        return "Random Walk";
    }

    return type.name ?? type.id;
}

function GenerationTypeCard({ projectLoaded, projectGenerationType, onTypeChange, onConfirmTypeChange }) {
    const [generationTypes, setGenerationTypes] = useState(null);
    const [selectedType, setSelectedType] = useState("");
    const [loadError, setLoadError] = useState(false);
    const [pendingGenerationType, setPendingGenerationType] = useState(null);
    const [confirmationText, setConfirmationText] = useState("");
    const [confirmationError, setConfirmationError] = useState(false);
    const [isConfirmingChange, setIsConfirmingChange] = useState(false);

    function cancelChange() {
        setPendingGenerationType(null);
        setConfirmationText("");
        setConfirmationError(false);
    }

    async function confirmChange() {
        if (confirmationText !== CONFIRMATION_PHRASE || !pendingGenerationType) return;

        setIsConfirmingChange(true);
        setConfirmationError(false);

        const nextSelection = pendingGenerationType.selection;
        const changed = await onConfirmTypeChange(nextSelection?.label ?? "none");
        if (!changed) {
            setConfirmationError(true);
            setIsConfirmingChange(false);
            return;
        }

        setSelectedType(nextSelection?.id ?? "");
        onTypeChange(nextSelection);
        cancelChange();
        setIsConfirmingChange(false);
    }

    useEffect(() => {
        let active = true;

        async function loadGenerationTypes() {
            try {
                const snapshot = await getDocs(collection(db, "generation"));
                const types = snapshot.docs.map((generationType) => ({
                    id: generationType.id,
                    ...generationType.data(),
                }));

                if (active) {
                    setGenerationTypes(types);
                }
            } catch {
                if (active) {
                    setGenerationTypes([]);
                    setLoadError(true);
                }
            }
        }

        loadGenerationTypes();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!projectLoaded || generationTypes === null) return;

        const storedType = normalizeGenerationType(projectGenerationType);
        const matchingType = storedType && storedType !== "none"
            ? generationTypes.find((type) => (
                normalizeGenerationType(type.id) === storedType
                || normalizeGenerationType(type.name) === storedType
            ))
            : null;

        setSelectedType(matchingType?.id ?? "");
        onTypeChange(matchingType
            ? { id: matchingType.id, label: getGenerationTypeLabel(matchingType) }
            : null);
    }, [generationTypes, onTypeChange, projectGenerationType, projectLoaded]);

    return (
        <>
        <Card className="w-full max-w-xl p-5">
            <CardHeader>
                <CardTitle>Dungeon Generation Type</CardTitle>
                <CardDescription>Choose how this project’s dungeon will be generated.</CardDescription>
                <div className="mt-4 flex flex-col gap-2">
                    <Label htmlFor="generation-type">Generation type</Label>
                    <select
                        id="generation-type"
                        className="h-10 w-fit min-w-[300px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={selectedType}
                        onChange={(event) => {
                            const selected = generationTypes.find((type) => type.id === event.target.value);
                            const nextSelection = selected
                                ? { id: selected.id, label: getGenerationTypeLabel(selected) }
                                : null;

                            if (selectedType && selectedType !== (nextSelection?.id ?? "")) {
                                setPendingGenerationType({ selection: nextSelection });
                                setConfirmationText("");
                                setConfirmationError(false);
                            } else {
                                setSelectedType(nextSelection?.id ?? "");
                                onTypeChange(nextSelection);
                            }
                        }}
                        disabled={!projectLoaded || !generationTypes?.length}
                    >
                        {generationTypes === null ? (
                            <option value="">Loading generation types…</option>
                        ) : generationTypes.length === 0 ? (
                            <option value="">{loadError ? "Could not load generation types" : "No generation types found"}</option>
                        ) : (
                            <>
                                <option value="">Select a generation type</option>
                                {generationTypes.map((type) => (
                                    <option key={type.id} value={type.id}>{type.name ?? type.id}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>
            </CardHeader>

        </Card>

        {pendingGenerationType && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !isConfirmingChange) cancelChange();
                    }}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="generation-warning-title"
                        aria-describedby="generation-warning-description"
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-2xl"
                    >
                        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">
                            <span className="text-xl font-bold">!</span>
                        </div>
                        <h2 id="generation-warning-title" className="text-lg font-semibold">
                            Change dungeon generation type?
                        </h2>
                        <p id="generation-warning-description" className="mt-2 text-sm leading-6 text-slate-600">
                            Changing the generation type may erase dungeon data for this project. This action cannot be undone.
                        </p>

                        <div className="mt-5 flex flex-col gap-2">
                            <Label htmlFor="delete-confirmation">
                                Type <span className="font-mono">{CONFIRMATION_PHRASE}</span> to continue
                            </Label>
                            <Input
                                id="delete-confirmation"
                                autoFocus
                                autoComplete="off"
                                value={confirmationText}
                                onChange={(event) => setConfirmationText(event.target.value)}
                                placeholder={CONFIRMATION_PHRASE}
                            />
                        </div>
                        {confirmationError && (
                            <p className="mt-3 text-sm text-red-700" role="alert">
                                Unable to switch generation type and clear its settings. Please try again.
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <Button type="button" variant="outline" disabled={isConfirmingChange} onClick={cancelChange}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={confirmationText !== CONFIRMATION_PHRASE || isConfirmingChange}
                                onClick={confirmChange}
                            >
                                {isConfirmingChange ? "Saving…" : "Confirm change"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function EditProjectCard({ projectName }) {
    const [projectState, setProjectState] = useState({ status: "loading" });
    const [selectedGenerationType, setSelectedGenerationType] = useState(null);
    const [isSavingGenerationType, setIsSavingGenerationType] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const navigate = useNavigate();

    async function confirmGenerationTypeChange(nextGenerationType) {
        setIsSavingGenerationType(true);
        setSaveError(false);

        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return false;

            const projectRef = doc(db, `users/${uid}/projects/${projectName}`);
            const settingsRef = doc(db, `users/${uid}/projects/${projectName}/gen-settings/settings`);
            const batch = writeBatch(db);
            batch.delete(settingsRef);
            batch.update(projectRef, {
                "gen-type": nextGenerationType,
            });
            await batch.commit();
            return true;
        } catch {
            setSaveError(true);
            return false;
        } finally {
            setIsSavingGenerationType(false);
        }
    }

    useEffect(() => {
        let active = true;

        async function loadProject() {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

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

    if (projectState.status === "not-found") {
        return <Navigate to="/dashboard" replace />;
    }

    const project = projectState.project;
    const description = projectState.status === "loading"
        ? "Loading project…"
        : projectState.status === "error"
            ? "Unable to load this project. Please try again."
            : project.description;
    const title = project?.title ?? projectName;

    return (
        <div className="w-full flex flex-col items-center gap-6 p-10">
            <Card className="w-full max-w-xl p-5">
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
            </Card>
            <GenerationTypeCard
                projectLoaded={projectState.status === "found"}
                projectGenerationType={project?.["gen-type"]}
                onTypeChange={setSelectedGenerationType}
                onConfirmTypeChange={confirmGenerationTypeChange}
            />
            <Card className="w-full max-w-xl p-5">
                <CardHeader>
                    <CardTitle>Generation Settings</CardTitle>
                    <Button
                        className="mt-3 w-fit"
                        disabled={!selectedGenerationType || isSavingGenerationType}
                        onClick={async () => {
                            setIsSavingGenerationType(true);
                            setSaveError(false);

                            try {
                                const uid = auth.currentUser.uid;
                                await updateDoc(doc(db, `users/${uid}/projects/${projectName}`), {
                                    "gen-type": selectedGenerationType.label,
                                });

                                const search = new URLSearchParams({ project: projectName });
                                navigate(`/gen-settings?${search.toString()}`, {
                                    state: { generationTypeId: selectedGenerationType.id },
                                });
                            } catch {
                                setSaveError(true);
                                setIsSavingGenerationType(false);
                            }
                        }}
                    >
                        {isSavingGenerationType ? "Saving…" : "edit settings"}
                    </Button>
                    {saveError && (
                        <CardDescription>Unable to save the generation type. Please try again.</CardDescription>
                    )}
                </CardHeader>
            </Card>
        </div>
    );
}

export function EditProject({ user, authLoading }) {
    const [searchParams] = useSearchParams();
    const projectName = searchParams.get("project");

    if (!projectName?.trim()) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <RequireVerifiedUser user={user} authLoading={authLoading}>
            <EditProjectCard projectName={projectName} />
        </RequireVerifiedUser>
    );
}
