/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { MagicWandIcon } from './icons';
import { improvePrompt } from '../services/geminiService';

interface AdjustmentPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  isLoading: boolean;
  currentImage: File | null;
}

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, isLoading, currentImage }) => {
  const [selectedPresetPrompt, setSelectedPresetPrompt] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const presets = [
    { name: 'Enhance Details', prompt: 'Subtly increase local contrast and sharpness across the image to enhance fine details and textures without adding visible noise or artifacts.' },
    { name: 'Blur Background', prompt: 'Apply a realistic depth-of-field effect, making the background blurry (like a f/1.8 aperture) while keeping the main subject in sharp focus.' },
    { name: 'Golden Hour', prompt: 'Adjust the color temperature and add a soft, warm glow to emulate the beautiful, diffused lighting of the golden hour just after sunrise.' },
    { name: 'Cinematic Glow', prompt: 'Add a professional cinematic "halation" or "bloom" effect to the highlights, giving the image a soft, dreamy, and high-end look.' },
    { name: 'Pop Colors', prompt: 'Boost the vibrancy and saturation of all colors in the image for a punchy, eye-catching look, while protecting skin tones from oversaturation.' },
    { name: 'Moody Shadows', prompt: 'Increase the depth and contrast of the shadows to create a more dramatic, moody, and intense atmosphere.' },
    { name: 'Dynamic Range Boost', prompt: 'Recover details from the brightest highlights and deepest shadows to increase the overall dynamic range, creating a balanced and rich image.' },
  ];

  const activePrompt = selectedPresetPrompt || customPrompt;

  const handlePresetClick = (prompt: string | null) => {
    setSelectedPresetPrompt(prompt);
    setCustomPrompt('');
    setPromptError(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
    setSelectedPresetPrompt(null);
    setPromptError(null);
  };

  const handleApply = () => {
    if (activePrompt) {
      onApplyAdjustment(activePrompt);
    }
  };
  
  const handleImprovePrompt = async () => {
    setIsImprovingPrompt(true);
    setPromptError(null);
    try {
        const newPrompt = await improvePrompt(customPrompt, 'adjust', currentImage, null);
        setCustomPrompt(newPrompt);
        setSelectedPresetPrompt(null); // Switch to custom after improving
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setPromptError(errorMessage);
        console.error(err);
    } finally {
        setIsImprovingPrompt(false);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">Apply a Professional Adjustment</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
         <button
            onClick={() => handlePresetClick(null)}
            disabled={isLoading}
            className={`w-full text-center bg-white/5 border text-gray-300 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${!selectedPresetPrompt ? 'border-blue-500' : 'border-transparent'}`}
          >
            None
          </button>
        {presets.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePresetClick(preset.prompt)}
            disabled={isLoading}
            className={`w-full text-center bg-white/10 border border-transparent text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${selectedPresetPrompt === preset.prompt ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : ''}`}
          >
            {preset.name}
          </button>
        ))}
      </div>
      
      <div className="relative w-full">
        <input
          type="text"
          value={customPrompt}
          onChange={handleCustomChange}
          placeholder="Or describe an adjustment (e.g., 'change background to a forest')"
          className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
          disabled={isLoading || isImprovingPrompt}
        />
        <button 
            type="button"
            onClick={handleImprovePrompt}
            disabled={isLoading || isImprovingPrompt}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors duration-200 text-gray-400 hover:bg-blue-500/20 hover:text-blue-300 disabled:hover:bg-transparent disabled:text-gray-600 disabled:cursor-not-allowed"
            aria-label="Improve prompt with AI"
        >
            {isImprovingPrompt ? (
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <MagicWandIcon className="w-6 h-6" />
            )}
        </button>
      </div>
      {promptError && <p className="text-sm text-red-400 text-center animate-fade-in">{promptError}</p>}

      {activePrompt && (
        <div className="animate-fade-in flex flex-col gap-4 pt-2">
            <button
                onClick={handleApply}
                className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                disabled={isLoading || !activePrompt.trim()}
            >
                Apply Adjustment
            </button>
        </div>
      )}
    </div>
  );
};

export default AdjustmentPanel;