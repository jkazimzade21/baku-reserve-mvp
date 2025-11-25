// Shim for react-native-gesture-handler GestureDetector on web/metro
// Metro sometimes fails to resolve the package's internal relative import
// `./useDetectorUpdater`. We mirror the original implementation here and
// import its neighbors explicitly.

import { useCallback } from 'react';
import { findNodeHandle } from 'react-native';
import { attachHandlers } from 'react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/attachHandlers';
import { updateHandlers } from 'react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/updateHandlers';
import { needsToReattach } from 'react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/needsToReattach';
import { dropHandlers } from 'react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/dropHandlers';
import { useForceRender, validateDetectorChildren } from 'react-native-gesture-handler/lib/module/handlers/gestures/GestureDetector/utils';

// Returns a function that's responsible for updating the attached gestures.
// If the view has changed, it will reattach the handlers to the new view.
// If the view remains the same, it will update the handlers with the new config.
export function useDetectorUpdater(state, preparedGesture, gesturesToAttach, gestureConfig, webEventHandlersRef) {
  const forceRender = useForceRender();

  const updateAttachedGestures = useCallback(
    // skipConfigUpdate is used to prevent unnecessary updates when only checking if the view has changed
    skipConfigUpdate => {
      // If the underlying view has changed we need to reattach handlers to the new view
      const viewTag = findNodeHandle(state.viewRef);
      const didUnderlyingViewChange = viewTag !== state.previousViewTag;

      if (didUnderlyingViewChange || needsToReattach(preparedGesture, gesturesToAttach)) {
        validateDetectorChildren(state.viewRef);
        dropHandlers(preparedGesture);
        attachHandlers({
          preparedGesture,
          gestureConfig,
          gesturesToAttach,
          webEventHandlersRef,
          viewTag,
        });

        if (didUnderlyingViewChange) {
          state.previousViewTag = viewTag;
          state.forceRebuildReanimatedEvent = true;
          forceRender();
        }
      } else if (!skipConfigUpdate) {
        updateHandlers(preparedGesture, gestureConfig, gesturesToAttach);
      }
    },
    [forceRender, gestureConfig, gesturesToAttach, preparedGesture, state, webEventHandlersRef],
  );

  return updateAttachedGestures;
}
