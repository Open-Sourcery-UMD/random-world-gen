import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function Project({ id, name, description, onDelete, onShare}) {
    const navigate = useNavigate();

    return (
        <Card className="w-75 p-5 h-75">
            <CardHeader className="flex justify-between items-center">
                <div>
                    <CardTitle>{name}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <Button onClick={() => {onShare()}}>Share</Button>
            </CardHeader>
            <div className="flex h-full flex-col items-center justify-end gap-5 mt-5">
                <Button className="w-3/4" onClick={() => {
                    const search = new URLSearchParams({ project: id });
                    navigate(`/edit?${search.toString()}`);
                }}>Edit</Button>
                <Button className="w-3/4" onClick={() => {onDelete()}}>
                    Delete
                </Button>
            </div>
        </Card>
    );
}
