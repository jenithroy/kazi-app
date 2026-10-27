/**
 * The canvas, made and fed. It builds the Stage once, hands it the latest props after every render and tears it down on
 * the way out. The picture on the table (`refImage`) is a ref, so a new one shows because `hasImage` changes.
 */
import { useEffect, useRef } from "react";
import { Stage } from "./Stage";

export default function StageCanvas({ api, stageRef }) {
  const canvas = useRef(null);
  const cursor = useRef(null);
  const stage = useRef(null);

  const props = {
    design: api.design,
    selection: api.selection,
    tool: api.tool,
    mode: api.mode,
    crop: api.crop,
    reference: api.design.reference,
    refImage: api.refImage.current?.canvas || null,
    stitches: api.stitches,
    simPos: api.sim.pos,
    showGrid: api.prefs.showGrid,
    showJumps: api.prefs.showJumps,
    showProblems: api.prefs.showProblems,
    showShapes: false,
    fabricColor: api.design.fabricColor,
    theme: document.documentElement.dataset.theme || "light",
    hooks: api.stageHooks,
  };

  useEffect(() => {
    stage.current = new Stage(canvas.current, props);
    stage.current.cursorEl = cursor.current;
    if (stageRef) stageRef.current = stage.current;
    return () => { stage.current?.destroy(); stage.current = null; if (stageRef) stageRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { stage.current?.set(props); });

  return (
    <>
      <canvas ref={canvas} className="dz-canvas" tabIndex={0} aria-label="Design canvas. Drag shapes to move them; scroll to zoom; hold Space and drag to pan." />
      <div ref={cursor} className="dz-cursor" aria-hidden="true" />
    </>
  );
}
