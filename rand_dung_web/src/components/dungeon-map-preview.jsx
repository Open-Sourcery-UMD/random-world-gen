import { useEffect, useRef } from "react";

export function DungeonMapPreview({ map }) {
    const canvasRef = useRef(null);
    const cellSize = Math.min(12, Math.max(2, Math.floor(600 / Math.max(map.width, map.height))));
    const displayWidth = map.width * cellSize;
    const displayHeight = map.height * cellSize;

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = displayWidth * pixelRatio;
        canvas.height = displayHeight * pixelRatio;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.imageSmoothingEnabled = false;

        context.fillStyle = "#0f172a";
        context.fillRect(0, 0, displayWidth, displayHeight);

        context.fillStyle = "#f5c77a";
        const inset = cellSize >= 4 ? 1 : 0;
        const tileSize = cellSize - (inset * 2);

        map.cells.forEach((row, rowIndex) => {
            row.forEach((cell, columnIndex) => {
                if (cell === 1) {
                    context.fillRect(
                        (columnIndex * cellSize) + inset,
                        (rowIndex * cellSize) + inset,
                        tileSize,
                        tileSize,
                    );
                }
            });
        });
    }, [cellSize, displayHeight, displayWidth, map.cells]);

    return (
        <canvas
            ref={canvasRef}
            width={displayWidth}
            height={displayHeight}
            style={{ width: displayWidth }}
            className="block max-w-full rounded-lg border border-slate-700 bg-slate-950 shadow-sm"
            role="img"
            aria-label={"Dungeon map, " + map.width + " columns by " + map.height + " rows. Gold tiles are passages and dark tiles are walls."}
        >
            Dungeon map preview
        </canvas>
    );
}
