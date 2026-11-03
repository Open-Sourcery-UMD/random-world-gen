import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { auth, db } from "@/App.jsx";
import { useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore"; 

export function CreateProject() {
    let [projectName, setProjectName] = useState("new-project");
    let [projectDescription, setProjectDescription] = useState("This is a new project.");
    let [projectStatus, setProjectStatus] = useState(null);

    const navigate = useNavigate();

    function validate(name) {
        const regex = /^[a-zA-Z0-9-]+$/;
        return regex.test(name);
    }

    function createNewProject() {
        if (!validate(projectName)) {
            alert("Invalid project name. Please use only letters, numbers, and dashes.");
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
        const docRef = doc(db, `users/${uid}/projects/${name}`);

        setProjectStatus("creating");

        setDoc(docRef, {
            title: name,
            description: description,
            "gen-type": "none",
        }).then(() => {
            navigate("/dashboard");
        })
        
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
