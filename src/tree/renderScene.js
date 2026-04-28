import { layoutForest } from "./layout.js";
import { renderForest } from "./render.js";
import { renderWires } from "./wires.js";
import { renderTextBoxes } from "./textBoxes.js";
import { renderCanvasImages } from "./canvasImages.js";
import { CANVAS_INTRO_CONFIG } from "../config.js";

export function renderScene({
  state,
  viewportEl,
  wiresEl,
  mode,
  onNodeClick,
  onAddChild,
  onSpawnBranch,
  onStarNode,
  onDeleteStar,
  onEditRootTitle,
  onDeleteRoot,
  getFilesForNode,
  onSaveThumbnailForNode,
  selectedTextBoxId = "",
  onTextBoxSelect,
  onTextBoxUpdate,
  onTextBoxCommit,
  onTextBoxDelete,
  selectedCanvasImageId = "",
  onCanvasImageSelect,
  onCanvasImageUpdate,
  onCanvasImageCommit,
  onCanvasImageDelete
}) {
  const layout = layoutForest(state, { startY: CANVAS_INTRO_CONFIG.treeStartY });

  renderForest({
    state,
    layout,
    viewportEl,
    mode,
    onNodeClick,
    onAddChild,
    onSpawnBranch,
    onStarNode,
    onDeleteStar,
    onEditRootTitle,
    onDeleteRoot,
    getFilesForNode,
    onSaveThumbnailForNode
  });

  renderWires({ state, layout, wiresEl });
  renderTextBoxes({
    textBoxes: state.textBoxes,
    viewportEl,
    mode,
    selectedId: selectedTextBoxId,
    onSelect: onTextBoxSelect,
    onUpdate: onTextBoxUpdate,
    onCommit: onTextBoxCommit,
    onDelete: onTextBoxDelete
  });
  renderCanvasImages({
    images: state.canvasImages,
    viewportEl,
    mode,
    selectedId: selectedCanvasImageId,
    onSelect: onCanvasImageSelect,
    onUpdate: onCanvasImageUpdate,
    onCommit: onCanvasImageCommit,
    onDelete: onCanvasImageDelete
  });

  return layout;
}
