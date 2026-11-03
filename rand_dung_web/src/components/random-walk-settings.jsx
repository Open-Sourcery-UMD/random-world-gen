import { CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
    { name: "grid_width", label: "Grid width", min: 2 },
    { name: "grid_height", label: "Grid height", min: 2 },
    { name: "max_tunnels", label: "Max tunnels", min: 1 },
    { name: "max_tunnel_length", label: "Max tunnel length", min: 1 },
];

export function RandomWalkSettings({ generationType, values, onChange, disabled = false }) {
    return (
        <div className="flex flex-col gap-5">
            <h3 className="text-sm font-medium">{generationType.name ?? "Random Walk"}</h3>
            {generationType.description && (
                <CardDescription>{generationType.description}</CardDescription>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FIELDS.map(({ name, label, min }) => (
                    <div key={name} className="flex flex-col gap-2">
                        <Label htmlFor={name}>{label}</Label>
                        <Input
                            id={name}
                            name={name}
                            type="number"
                            inputMode="numeric"
                            min={min}
                            step="1"
                            value={values[name]}
                            disabled={disabled}
                            onChange={(event) => onChange({
                                ...values,
                                [name]: event.target.value,
                            })}
                        />
                    </div>
                ))}
            </div>
            <CardDescription>
                Use whole numbers. Grid width and height must be at least 2; tunnel values must be at least 1.
            </CardDescription>
        </div>
    );
}
