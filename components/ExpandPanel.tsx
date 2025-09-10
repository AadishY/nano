/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo } from 'react';

type ExpandRect = { top: number; left: number; width: number; height: number; };

interface ExpandControlsProps {
  onApplyExpand: () => void;
  isLoading: boolean;
  imageDimensions: { width: number; height: number } | null;
  expandRect: ExpandRect | null;
  displayedImageRect: DOMRect | null;
}

const ExpandPanel: React.FC<ExpandControlsProps> = ({ 
  onApplyExpand, 
  isLoading,
  imageDimensions,
  expandRect,
  displayedImageRect,
}) => {

  const newDimensions = useMemo(() => {
    if (!imageDimensions || !expandRect || !displayedImageRect) {
      return null;
    }

    const scale = imageDimensions.width / displayedImageRect.width;
    const targetWidth = Math.round(expandRect.width * scale);
    const targetHeight = Math.round(expandRect.height * scale);

    return { width: targetWidth, height: targetHeight };
  }, [imageDimensions, expandRect, displayedImageRect]);

  const isExpanded = newDimensions && imageDimensions && (newDimensions.width > imageDimensions.width || newDimensions.height > imageDimensions.height);

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-gray-300">Expand Canvas</h3>
      <p className="text-sm text-gray-400 -mt-2 text-center max-w-lg">Drag the frame handles to set the new canvas size. The AI will automatically fill the new areas by extending the image.</p>
      
      {newDimensions && (
        <div className="text-center font-mono text-lg text-blue-300 bg-black/20 px-4 py-2 rounded-md">
            {newDimensions.width} x {newDimensions.height} px
        </div>
      )}

      <button
        onClick={onApplyExpand}
        className="w-full max-w-xs mt-2 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none animate-fade-in"
        disabled={isLoading || !isExpanded}
      >
        Generate Expansion
      </button>
    </div>
  );
};

export default ExpandPanel;