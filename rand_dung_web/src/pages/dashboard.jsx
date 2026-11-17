import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Project } from "@/components/project";
import { SharedProject } from "@/components/shared-project";
import { getDocs, collection, doc, getDoc, where, query, writeBatch, arrayRemove, arrayUnion, or } from "firebase/firestore"; 
import { useState, useEffect } from "react";
import { db, auth } from "@/App.jsx";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ProjectInvite } from "@/components/project-invite";

export function Dashboard() {
    const [projects, setProjects] = useState(null);
    const navigate = useNavigate();

    const fetchProjects = async () => {
        if (auth.currentUser == null) return;

        const projectsQuery = query(
            collection(db, "projects"),
            or(
                where("allowed-users", "array-contains", auth.currentUser.uid),
                where("invited-users", "array-contains", auth.currentUser.email)
            )
        );

        const querySnapshot = await getDocs(projectsQuery);
        setProjects(querySnapshot);
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    async function deleteProject(projectId) {
        const uid = auth.currentUser.uid;

        const batch = writeBatch(db);

        //deleting project from all users' subcollections
        const projectDoc = await getDoc(doc(db, `projects/${projectId}`));
        for(const user of projectDoc.data()["allowed-users"]) {
            batch.delete(doc(db, `users/${user}/projects/${projectId}`));
        }

        //delete the sub-collection - deleting a doc, does not delete subcollections
        batch.delete(doc(db, `projects/${projectId}/gen-settings/settings`))
        .delete(doc(db, `projects/${projectId}`)); //delete the project doc

        await batch.commit().then(() => {
            fetchProjects();
        });
    }

    function shareProject(projectId) {
    }

    async function handleInvite(projectId, accepted) {
        const uid = auth.currentUser.uid;

        const batch = writeBatch(db);
        batch.update(doc(db, `projects/${projectId}`), {
            "invited-users": arrayRemove(auth.currentUser.email)
        });
        if(accepted) {
            batch.update(doc(db, `projects/${projectId}`), {
                "allowed-users": arrayUnion(uid)
            });
        }
        await batch.commit().then(() => {
            fetchProjects();
        });
    }

    function getProjects() {
        if(projects == null || projects.docs.length == 0) return (
            <div className="w-full flex justify-center items-center gap-10 p-10">
                <Card className="w-100 p-5">
                    <CardHeader>
                        <CardTitle>No Projects Found</CardTitle>
                        <CardDescription>
                            You don't have any projects yet. Create one to get started!
                        </CardDescription>

                        <div className="h-20 flex flex-col items-center justify-end gap-5 mt-5">
                            <Button className="w-3/4" onClick={() => navigate("/create-project")}>
                                Create First Project
                            </Button>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        );

        return (
            <div className="w-full flex justify-center flex-wrap gap-10 p-10">
                {projects.docs.map((project) => {
                    if(project.data()["allowed-users"][0] != auth.currentUser.uid) {
                        return <SharedProject key={project.id} id={project.id} name={project.data().title} 
                        description={project.data().description}/>
                    }
                    else if(project.data()["invited-users"].includes(auth.currentUser.email)) {
                        return <ProjectInvite key={project.id} id={project.id} name={project.data().title} 
                        description={project.data().description} 
                        onAccept={async () => await handleInvite(project.id, true)}
                        onDecline={async () => await handleInvite(project.id, false)}/>
                    }
                    return <Project key={project.id} id={project.id} name={project.data().title} 
                    description={project.data().description} 
                    onDelete={async () => await deleteProject(project.id)}
                    onShare={async () => shareProject(project.id)}/>;
                })}
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col justify-center gap-10 p-10">
            <Card className="w-full p-5">
                <CardHeader>
                    <CardTitle>Welcome!</CardTitle>
                    <CardDescription>
                        This is the dashboard where you can access and manage all of your current projects.
                    </CardDescription>
                </CardHeader>
            </Card>

            <Card className="w-full p-5">
                <CardHeader>
                    <div className="w-full flex flex-row items-end justify-between gap-5">
                        <CardTitle>Projects</CardTitle>

                        <Button className="w-50" onClick={() => navigate("/create-project")}>
                            Create New Project
                        </Button>
                    </div>
                </CardHeader>

                {getProjects()}
            </Card>
        </div>
    );
}
