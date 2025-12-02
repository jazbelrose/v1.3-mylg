import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { UNDO_COMMAND, COMMAND_PRIORITY_HIGH } from "lexical";

/**
 * UndoBoundaryPlugin prevents undo operations from going past the initial
 * content state. This ensures that repeated Ctrl+Z doesn't empty the editor
 * when using collaborative editing with Yjs.
 * 
 * The plugin works by:
 * 1. Storing a snapshot of the initial editor state
 * 2. Intercepting UNDO_COMMAND before it's processed
 * 3. Comparing current state with initial state
 * 4. Blocking undo if they match (we're at the boundary)
 */
const UndoBoundaryPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const initialStateRef = useRef<string | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Capture initial state once editor is ready
    if (!hasInitializedRef.current) {
      const captureInitialState = () => {
        editor.getEditorState().read(() => {
          const json = JSON.stringify(editor.getEditorState().toJSON());
          initialStateRef.current = json;
          console.log("[UndoBoundary] Captured initial state");
        });
        hasInitializedRef.current = true;
      };

      // Wait a bit for CollaborationPlugin to initialize and inject content
      const timer = setTimeout(captureInitialState, 500);
      return () => clearTimeout(timer);
    }
  }, [editor]);

  useEffect(() => {
    // Intercept UNDO_COMMAND with high priority
    const removeUndoListener = editor.registerCommand(
      UNDO_COMMAND,
      () => {
        if (!initialStateRef.current) {
          // Initial state not captured yet, allow undo
          return false;
        }

        // Check if current state matches initial state
        let currentState: string | null = null;
        editor.getEditorState().read(() => {
          currentState = JSON.stringify(editor.getEditorState().toJSON());
        });

        if (currentState === initialStateRef.current) {
          // We're at the initial state boundary - block further undo
          console.log("[UndoBoundary] Blocked undo at initial state");
          return true; // Returning true prevents default undo behavior
        }

        // Not at boundary, allow undo to proceed
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeUndoListener();
    };
  }, [editor]);

  return null;
};

export default UndoBoundaryPlugin;
