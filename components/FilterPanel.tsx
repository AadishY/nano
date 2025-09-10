/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { MagicWandIcon } from './icons';
import { improvePrompt } from '../services/geminiService';

interface FilterPanelProps {
  onApplyFilter: (prompt: string) => void;
  isLoading: boolean;
  currentImage: File | null;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ onApplyFilter, isLoading, currentImage }) => {
  const [selectedPresetPrompt, setSelectedPresetPrompt] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const presets = [
    { name: 'Synthwave', prompt: 'Apply a vibrant 80s synthwave aesthetic with neon magenta and cyan glows, grid lines on the ground plane, and a subtle VHS scan line effect.' },
    { name: 'Vintage Film', prompt: 'Emulate the look of classic 1970s Kodak film with faded colors, noticeable film grain, slightly crushed blacks, and a warm, yellowed tint.' },
    { name: 'Noir', prompt: 'Convert the image to a high-contrast, dramatic black and white noir style, with deep, inky shadows and stark, bright highlights.' },
    { name: 'Anime', prompt: 'Transform the entire image into a vibrant, high-quality Japanese anime style. Use cel-shading, bold outlines, expressive character features, and a bright, saturated color palette characteristic of modern anime films.' },
    { name: 'Infrared', prompt: 'Simulate an infrared photograph look, where green foliage turns white or light pink, and skies become dark and dramatic.' },
    { name: 'Dreamy Haze', prompt: 'Add a soft, ethereal, and dream-like haze to the image, with blooming highlights and a gentle, low-contrast feel.' },
    { name: 'Watercolor', prompt: 'Transform the image to look like a soft, delicate watercolor painting with visible paper texture and gentle color bleeds.' },
    { name: 'Cyberpunk', prompt: 'Give the image a futuristic, dystopian cyberpunk feel with saturated neon blue and pink lighting, heavy rain, and a gritty, high-tech atmosphere.' },
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
      onApplyFilter(activePrompt);
    }
  };

  const handleImprovePrompt = async () => {
    setIsImprovingPrompt(true);
    setPromptError(null);
    try {
        const newPrompt = await improvePrompt(customPrompt, 'filter', currentImage, null);
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
      <h3 className="text-lg font-semibold text-center text-gray-300">Apply a Creative Filter</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
         <button
            onClick={() => handlePresetClick(null)}
            disabled={isLoading}
            className={`w-full text-center bg-white/5 border text-gray-300 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${selectedPresetPrompt === null ? 'border-blue-500' : 'border-transparent'}`}
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
          placeholder="Or describe a custom filter (e.g., '80s synthwave glow')"
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
            Apply Filter
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;