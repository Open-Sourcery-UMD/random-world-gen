import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { getDoc, doc } from "firebase/firestore";
import { db, auth } from "@/App.jsx";

export function SharedProject({ id, name, description, fetchProjects}) {
    const navigate = useNavigate();

    return (
        <Card className="w-75 p-5 h-75">
            <CardHeader className="flex justify-between items-center">
                <div>
                    <CardTitle>{name}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
            </CardHeader>
            <div className="flex h-full flex-col items-center justify-end gap-4 mt-5">
                <Button className="w-3/4" onClick={async () => {
                    
                    const projectDoc = await getDoc(doc(db, `projects/${id}`));
                    if(projectDoc.data()["allowed-users"].includes(auth.currentUser.uid) == false) {
                        alert("You are not allowed to access this project.");
                        fetchProjects();
                        return;
                    }
                    const search = new URLSearchParams({ project: id });
                    navigate(`/edit?${search.toString()}`);
                }}>Edit</Button>
            </div>
        </Card>
    );
}
