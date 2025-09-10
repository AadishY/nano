/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect } from 'react';
import { generateImageFromPrompt, improvePrompt } from '../services/geminiService';
import { dataURLtoFile } from '../App';
import { CloseIcon, MagicWandIcon, UploadIcon } from './icons';
import Spinner from './Spinner';

interface ImageGenerationModalProps {
  onClose: () => void;
  onImageGenerated: (file: File) => void;
}

type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type Style = 'None' | 'Photorealistic' | 'Anime' | 'Fantasy' | 'Sci-Fi' | 'Minimalist' | 'Watercolor';

const styles: Style[] = ['None', 'Photorealistic', 'Anime', 'Fantasy', 'Sci-Fi', 'Minimalist', 'Watercolor'];
const aspectRatios: { name: string, value: AspectRatio }[] = [
    { name: '1:1', value: '1:1' },
    { name: '16:9', value: '16:9' },
    { name: '9:16', value: '9:16' },
    { name: '4:3', value: '4:3' },
    { name: '3:4', value: '3:4' },
];

const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({ onClose, onImageGenerated }) => {
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [style, setStyle] = useState<Style>('None');
    const [referenceImage, setReferenceImage] = useState<File | null>(null);
    const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    
    useEffect(() => {
        if (referenceImage) {
            const url = URL.createObjectURL(referenceImage);
            setReferenceImageUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setReferenceImageUrl(null);
        }
    }, [referenceImage]);

    const handleImprovePrompt = useCallback(async () => {
        setIsImprovingPrompt(true);
        setError(null);
        try {
            const newPrompt = await improvePrompt(prompt, 'generate', referenceImage, null);
            setPrompt(newPrompt);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to improve prompt: ${errorMessage}`);
        } finally {
            setIsImprovingPrompt(false);
        }
    }, [prompt, referenceImage]);
    
    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            setError('Please enter a prompt to generate an image.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImageUrl(null);

        try {
            const imageUrl = await generateImageFromPrompt(prompt, aspectRatio, style, referenceImage);
            setGeneratedImageUrl(imageUrl);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, style, aspectRatio, referenceImage]);
    
    const handleEditImage = () => {
        if (generatedImageUrl) {
            const file = dataURLtoFile(generatedImageUrl, `generated-${Date.now()}.png`);
            onImageGenerated(file);
        }
    };
    
    const handleGenerateAnother = () => {
        setGeneratedImageUrl(null);
        setError(null);
    };

    const handleReferenceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReferenceImage(e.target.files[0]);
        }
    }

    return (
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-md p-4"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800/80 border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl p-6 md:p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-100">Generate a New Image</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-lg text-center animate-fade-in">
                        <p>{error}</p>
                    </div>
                )}
                
                {isLoading && (
                    <div className="text-center p-8 flex flex-col items-center justify-center gap-4">
                        <Spinner />
                        <p className="text-gray-300">Generating your image... this can take a moment.</p>
                    </div>
                )}
                
                {generatedImageUrl && !isLoading && (
                    <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <img src={generatedImageUrl} alt="Generated image" className="rounded-lg max-w-full max-h-[50vh] object-contain" />
                        <div className="flex items-center justify-center gap-4 w-full">
                           <button onClick={handleGenerateAnother} className="w-full bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20">
                                Generate Another
                           </button>
                           <button onClick={handleEditImage} className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl">
                                Edit This Image
                           </button>
                        </div>
                    </div>
                )}

                {!isLoading && !generatedImageUrl && (
                    <div className="flex flex-col gap-5 animate-fade-in">
                         <div className="flex flex-col gap-2">
                            <label className="font-semibold text-gray-300">1. Describe your image</label>
                            <div className="relative w-full">
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="e.g., A majestic lion wearing a crown, sitting on a throne in a futuristic city"
                                    className="flex-grow bg-gray-900 border border-gray-600 text-gray-200 rounded-lg p-4 pr-14 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base h-28 resize-none"
                                    disabled={isImprovingPrompt}
                                />
                                <button 
                                    type="button"
                                    onClick={handleImprovePrompt}
                                    disabled={isImprovingPrompt}
                                    className="absolute right-2 top-3 p-2 rounded-full transition-colors duration-200 text-gray-400 hover:bg-blue-500/20 hover:text-blue-300 disabled:hover:bg-transparent disabled:text-gray-600 disabled:cursor-not-allowed"
                                    aria-label="Improve prompt with AI"
                                >
                                    {isImprovingPrompt ? (
                                        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <MagicWandIcon className="w-6 h-6" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                             <label className="font-semibold text-gray-300">2. Add a reference image (optional)</label>
                             {referenceImageUrl ? (
                                 <div className="w-full bg-gray-900/50 p-2 rounded-lg flex items-center justify-between animate-fade-in border border-gray-600">
                                    <div className="flex items-center gap-3">
                                        <img src={referenceImageUrl} className="w-16 h-16 object-cover rounded" alt="Reference preview" />
                                        <p className="text-sm text-gray-300 font-medium">{referenceImage?.name}</p>
                                    </div>
                                    <button onClick={() => setReferenceImage(null)} className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
                                        <CloseIcon className="w-5 h-5" />
                                    </button>
                                </div>
                             ) : (
                                <label htmlFor="reference-upload" className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-900/50 hover:bg-gray-900/80 transition-colors">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <UploadIcon className="w-6 h-6" />
                                        <p className="text-sm">Click to upload or drag & drop</p>
                                    </div>
                                </label>
                             )}
                             <input id="reference-upload" type="file" className="hidden" accept="image/*" onChange={handleReferenceImageChange} />
                        </div>
                        
                        <div className="flex flex-col gap-2">
                             <label className={`font-semibold transition-colors ${referenceImage ? 'text-gray-500' : 'text-gray-300'}`}>
                                3. Select a style
                             </label>
                             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {styles.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStyle(s)}
                                        disabled={!!referenceImage}
                                        className={`px-4 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                          style === s
                                          ? 'bg-blue-500 text-white shadow-md' 
                                          : 'bg-white/10 hover:bg-white/20 text-gray-200'
                                        }`}
                                    >{s}</button>
                                ))}
                             </div>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                             <label className={`font-semibold transition-colors ${referenceImage ? 'text-gray-500' : 'text-gray-300'}`}>
                                4. Choose an aspect ratio
                             </label>
                             <div className="grid grid-cols-3 gap-2">
                                {aspectRatios.map(ar => (
                                    <button
                                        key={ar.value}
                                        onClick={() => setAspectRatio(ar.value)}
                                        disabled={!!referenceImage}
                                        className={`px-4 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                          aspectRatio === ar.value
                                          ? 'bg-blue-500 text-white shadow-md' 
                                          : 'bg-white/10 hover:bg-white/20 text-gray-200'
                                        }`}
                                    >{ar.name}</button>
                                ))}
                             </div>
                        </div>

                        <button
                            onClick={handleGenerate}
                            className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={!prompt.trim()}
                        >
                            Generate
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageGenerationModal;