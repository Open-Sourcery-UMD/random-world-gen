import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { auth, db } from "@/App.jsx";
import { useNavigate } from "react-router-dom";
import { doc, writeBatch, getDoc } from "firebase/firestore"; 

export function CreateProject() {
    let [projectName, setProjectName] = useState("new-project");
    let [projectDescription, setProjectDescription] = useState("This is a new project.");
    let [projectStatus, setProjectStatus] = useState(null);

    const navigate = useNavigate();

    function validate(name) {
        const regex = /^[a-zA-Z0-9-]+$/;
        return regex.test(name);
    }

    async function validateDupliates(name) {
        const uid = auth.currentUser.uid;
        const projectId = name + "" + uid;

        const projectRef = await getDoc(doc(db, `/users/${uid}/projects/${projectId}`));
        return !projectRef.exists();
    }

    function createNewProject() {//TODO: eventually, another text element below the input should show whether there are any errors with the input, rather than using an alert
        if (!validate(projectName)) {
            alert("Invalid project name. Please use only letters, numbers, and dashes.");
            return;
        }

        if(!validateDupliates(projectName)) {
            alert("Project name already exists. Please choose a different name.");
            return;
        }

        if(projectDescription.length > 100 || projectDescription.length < 10) {
            alert("Invalid project description. Please enter a description between 10 and 100 characters.");
            return;
        }

        uploadNewProject(projectName, projectDescription);
    }

    function uploadNewProject(name, description) {
        const uid = auth.currentUser.uid;
        const projectId = name + "" + uid; //temporary hash (name + uid)
        const docRef1 = doc(db, `users/${uid}/projects/${projectId}`);
        const docRef2 = doc(db, `projects/${projectId}`);

        setProjectStatus("creating");
        
        const batch = writeBatch(db);
        batch.set(docRef1, {
            "project-id": projectId, //temporary hash (name + uid)
        }).set(docRef2, {
            title: name,
            description: description,
            "gen-type": "none",
            "allowed-users": [uid],
        }).commit().then(() => {
            navigate("/dashboard");
        });
    }
        

    return (
        <div className="w-full flex flex-col justify-center items-center gap-10 p-10">
            <div className="w-100">
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Project</CardTitle>
                        <CardDescription>
                            Enter in the various details for your new project. You can always change them later.
                        </CardDescription>


                        <div className="flex items-center justify-center gap-5 mt-5 w-full pb-5">
                            <div className="flex flex-col items-center justify-end gap-5 mt-5 w-75">
                                <h3>Project Title:</h3>
                                <Input placeholder="Project Name" value={projectName} onChange={(e) => setProjectName(e.target.value)}></Input>
                                
                                <br/>

                                <h3>Project Description:</h3>
                                <Input placeholder="Project Description" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)}></Input>

                                <br/>

                                <Button className="w-full" onClick={() => createNewProject()} disabled={projectStatus === "creating"}>Create Project</Button>
                                <Button className="w-full" onClick={() => navigate("/dashboard")} disabled={projectStatus === "creating"}>Cancel</Button>
                            </div>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        </div>
    )
}
