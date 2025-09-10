/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateRetouchedImage, generateFilteredImage, generateAdjustedImage, improvePrompt, upscaleImage, generateExpandedImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon, MagicWandIcon, ImageIcon, CloseIcon, ExpandIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import ImageGenerationModal from './components/ImageGenerationModal';
import ConfirmationModal from './components/ConfirmationModal';
import ExpandPanel from './components/ExpandPanel';

// Helper to convert a data URL string to a File object
export const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'adjust' | 'filters' | 'expand' | 'crop';
type ExpandRect = { top: number; left: number; width: number; height: number; };
type DragState = { handle: string; initialRect: ExpandRect; initialMouseX: number; initialMouseY: number; };


const App: React.FC = () => {
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [isImprovingPrompt, setIsImprovingPrompt] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);

  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Expand state
  const [expandRect, setExpandRect] = useState<ExpandRect | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Retouching state
  const [retouchReferenceImage, setRetouchReferenceImage] = useState<File | null>(null);
  const [retouchReferenceImageUrl, setRetouchReferenceImageUrl] = useState<string | null>(null);

  // Image Generation Modal
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  
  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to initialize expand rectangle when switching to expand tab
  useEffect(() => {
    if (activeTab === 'expand') {
        // Use a timeout to give the browser time to reflow and calculate the final image dimensions after a tab switch.
        const timerId = setTimeout(() => {
            if (imgRef.current && imageContainerRef.current) {
                const imgRect = imgRef.current.getBoundingClientRect();
                const containerRect = imageContainerRef.current.getBoundingClientRect();
                setExpandRect({
                    top: imgRect.top - containerRect.top,
                    left: imgRect.left - containerRect.left,
                    width: imgRect.width,
                    height: imgRect.height,
                });
            }
        }, 50);
        return () => clearTimeout(timerId);
    } else {
        setExpandRect(null);
    }
  }, [activeTab]);


  // Effect for handling global mouse events during drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!dragState || !imgRef.current || !imageContainerRef.current) return;
        
        const { handle, initialRect, initialMouseX, initialMouseY } = dragState;
        const deltaX = e.clientX - initialMouseX;
        const deltaY = e.clientY - initialMouseY;
        
        const imgRect = imgRef.current.getBoundingClientRect();
        const containerRect = imageContainerRef.current.getBoundingClientRect();

        // Position of the displayed image relative to the container
        const imgTop = imgRect.top - containerRect.top;
        const imgLeft = imgRect.left - containerRect.left;
        const imgRight = imgLeft + imgRect.width;
        const imgBottom = imgTop + imgRect.height;
        
        let newTop = initialRect.top;
        let newLeft = initialRect.left;
        let newRight = initialRect.left + initialRect.width;
        let newBottom = initialRect.top + initialRect.height;

        if (handle.includes('n')) {
            newTop = initialRect.top + deltaY;
        }
        if (handle.includes('s')) {
            newBottom = initialRect.top + initialRect.height + deltaY;
        }
        if (handle.includes('w')) {
            newLeft = initialRect.left + deltaX;
        }
        if (handle.includes('e')) {
            newRight = initialRect.left + initialRect.width + deltaX;
        }

        // Apply constraints to prevent shrinking past the image
        if (newTop > imgTop) newTop = imgTop;
        if (newLeft > imgLeft) newLeft = imgLeft;
        if (newRight < imgRight) newRight = imgRight;
        if (newBottom < imgBottom) newBottom = imgBottom;
        
        setExpandRect({
          top: newTop,
          left: newLeft,
          width: newRight - newLeft,
          height: newBottom - newTop,
        });
    };

    const handleMouseUp = () => {
        setDragState(null);
    };

    if (dragState) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);


  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  useEffect(() => {
    if (retouchReferenceImage) {
      const url = URL.createObjectURL(retouchReferenceImage);
      setRetouchReferenceImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setRetouchReferenceImageUrl(null);
    }
  }, [retouchReferenceImage]);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
    setExpandRect(null);
  }, [history, historyIndex]);

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    setHistory([file]);
    setHistoryIndex(0);
    setActiveTab('retouch');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setExpandRect(null);
    setImageDimensions(null);
  }, []);
  
  const handleGeneratedImage = useCallback((file: File) => {
    handleImageUpload(file);
    setIsGeneratingImage(false); // Close modal and go to editor
  }, [handleImageUpload]);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) {
      setError('No image loaded to edit.');
      return;
    }
    
    if (!prompt.trim()) {
        setError('Please enter a description for your edit.');
        return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        const editedImageUrl = await generateRetouchedImage(currentImage, prompt, retouchReferenceImage);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile);
        setRetouchReferenceImage(null); // Clear reference image after use
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, retouchReferenceImage, addImageToHistory]);

  const handleImprovePrompt = useCallback(async () => {
    setIsImprovingPrompt(true);
    setError(null);
    try {
        const newPrompt = await improvePrompt(prompt, 'retouch', currentImage, retouchReferenceImage);
        setPrompt(newPrompt);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to improve prompt. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsImprovingPrompt(false);
    }
  }, [prompt, currentImage, retouchReferenceImage]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply a filter to.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the filter. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply an adjustment to.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the adjustment. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError('Please select an area to crop.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError('Could not process the crop.');
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile);

  }, [completedCrop, addImageToHistory]);

  const handleApplyExpand = useCallback(async () => {
    if (!currentImage || !expandRect || !imgRef.current || !imageDimensions || !imageContainerRef.current) {
        setError('Could not determine expansion dimensions. Please try selecting the expand tool again.');
        return;
    }

    const displayedImageRect = imgRef.current.getBoundingClientRect();
    const containerRect = imageContainerRef.current.getBoundingClientRect();
    
    // The scale factor between the original image's natural dimensions and its displayed dimensions
    const scale = imageDimensions.width / displayedImageRect.width;

    // Calculate the target dimensions of the new canvas in pixels
    const targetWidth = Math.round(expandRect.width * scale);
    const targetHeight = Math.round(expandRect.height * scale);

    // Calculate the top-left offset for placing the original image onto the new canvas
    const imageOffsetX = Math.round((displayedImageRect.left - (containerRect.left + expandRect.left)) * scale);
    const imageOffsetY = Math.round((displayedImageRect.top - (containerRect.top + expandRect.top)) * scale);
    
    // Check if any expansion happened
    if (targetWidth <= imageDimensions.width && targetHeight <= imageDimensions.height) {
        setError('Please expand the frame outwards to generate a larger image.');
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        const expandedImageUrl = await generateExpandedImage(currentImage, { width: targetWidth, height: targetHeight }, { x: imageOffsetX, y: imageOffsetY });
        const newImageFile = dataURLtoFile(expandedImageUrl, `expanded-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to expand the image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, expandRect, imageDimensions]);

  const handleExpandMouseDown = (e: React.MouseEvent<HTMLDivElement>, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (expandRect) {
        setDragState({
            handle,
            initialRect: expandRect,
            initialMouseX: e.clientX,
            initialMouseY: e.clientY,
        });
    }
  };


  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
    }
  }, [canUndo, historyIndex]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
    }
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
    }
  }, [history]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setRetouchReferenceImage(null);
      setImageDimensions(null);
  }, []);

  const handleLogoClick = () => {
    if (historyIndex > 0) {
        setIsConfirmModalOpen(true);
    } else {
        handleUploadNew();
    }
  };

  const handleConfirmLeave = () => {
    handleUploadNew();
    setIsConfirmModalOpen(false);
  };

  const handleCancelLeave = () => {
    setIsConfirmModalOpen(false);
  };

  const handleDownload = useCallback(() => {
      if (currentImage) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(currentImage);
          link.download = `edited-${currentImage.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
      }
  }, [currentImage]);

  const handleUpscale = useCallback(async () => {
    if (!currentImage) return;

    setIsUpscaling(true);
    setError(null);
    try {
        const upscaledImageUrl = await upscaleImage(currentImage);
        const newImageFile = dataURLtoFile(upscaledImageUrl, `upscaled-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to upscale image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsUpscaling(false);
    }
}, [currentImage, addImageToHistory]);
  
  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  };

  const handleReferenceImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setRetouchReferenceImage(e.target.files[0]);
    }
  };
  
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!imageDimensions) { // Only set on first load of a new image
        setImageDimensions({ width: naturalWidth, height: naturalHeight });
    }
  };
  
  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => {
                  setError(null);
                  setIsLoading(false);
                  setIsUpscaling(false);
                  setIsImprovingPrompt(false);
                }}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }
    
    if (!currentImageUrl) {
      return (
        <>
            <StartScreen onFileSelect={handleFileSelect} onGenerateClick={() => setIsGeneratingImage(true)} />
            {isGeneratingImage && (
                <ImageGenerationModal 
                    onClose={() => setIsGeneratingImage(false)} 
                    onImageGenerated={handleGeneratedImage} 
                />
            )}
        </>
      );
    }
    
    const expandBackgroundStyle: React.CSSProperties = activeTab === 'expand' ? {
        backgroundImage: 'repeating-conic-gradient(#333 0% 25%, #444 0% 50%)',
        backgroundSize: '20px 20px',
    } : {};
    
    const imageDisplay = (
      <>
        {originalImageUrl && (
            <img
                key={originalImageUrl}
                src={originalImageUrl}
                alt="Original"
                className={`w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none transition-all duration-300 ${activeTab === 'expand' ? 'shadow-2xl' : ''}`}
            />
        )}
        <img
            ref={imgRef}
            key={currentImageUrl}
            src={currentImageUrl}
            alt="Current"
            className={`w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing ? 'opacity-0' : 'opacity-100'} absolute top-0 left-0 ${activeTab === 'expand' ? 'shadow-2xl' : ''}`}
            onLoad={handleImageLoad}
        />
      </>
    );
    
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={`crop-${currentImageUrl}`}
        src={currentImageUrl} 
        alt="Crop this image"
        className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
      />
    );


    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div 
            ref={imageContainerRef}
            className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20 flex items-center justify-center min-h-[200px]"
            style={expandBackgroundStyle}
        >
            {(isLoading || isUpscaling) && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">{isUpscaling ? 'Upscaling image...' : isLoading && activeTab === 'expand' ? 'Expanding canvas...' : 'AI is working its magic...'}</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                {cropImageElement}
              </ReactCrop>
            ) : imageDisplay }

            {activeTab === 'expand' && expandRect && (
              <div 
                className="absolute border-2 border-dashed border-blue-400 pointer-events-none"
                style={{
                  top: expandRect.top,
                  left: expandRect.left,
                  width: expandRect.width,
                  height: expandRect.height,
                }}
              >
                {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(handle => {
                  const getHandleStyle = () => {
                    const style: React.CSSProperties = { position: 'absolute' };
                    if (handle.includes('n')) style.top = -6;
                    if (handle.includes('s')) style.bottom = -6;
                    if (handle.includes('w')) style.left = -6;
                    if (handle.includes('e')) style.right = -6;
                    if (handle === 'n' || handle === 's') { style.left = '50%'; style.transform = 'translateX(-50%)'; }
                    if (handle === 'w' || handle === 'e') { style.top = '50%'; style.transform = 'translateY(-50%)'; }
                    return style;
                  }
                  const getHandleCursor = () => {
                    if (handle === 'n' || handle === 's') return 'handle-cursor-ns';
                    if (handle === 'e' || handle === 'w') return 'handle-cursor-ew';
                    if (handle === 'nw' || handle === 'se') return 'handle-cursor-nwse';
                    if (handle === 'ne' || handle === 'sw') return 'handle-cursor-nesw';
                    return '';
                  }
                  return (
                    <div
                      key={handle}
                      onMouseDown={(e) => handleExpandMouseDown(e, handle)}
                      className={`w-3 h-3 bg-white rounded-full pointer-events-auto border-2 border-blue-500 shadow-lg ${getHandleCursor()}`}
                      style={getHandleStyle()}
                    />
                  );
                })}
              </div>
            )}
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm flex-wrap sm:flex-nowrap">
            {(['retouch', 'adjust', 'filters', 'expand', 'crop'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); }}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base flex items-center justify-center gap-2 ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tab === 'expand' && <ExpandIcon className="w-5 h-5" />}
                    {tab}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <p className="text-md text-gray-400 text-center">
                      Describe your edit in detail (e.g., "change the color of the car to blue") or add a reference image for composite edits.
                    </p>
                    
                    <div className="w-full flex flex-col items-center gap-2">
                        <div className="relative w-full">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g., 'make the sky more dramatic' or 'add the person from the reference photo'"
                                className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 pr-28 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isLoading || isImprovingPrompt}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); } }}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <label htmlFor="reference-image-upload" className="p-2 rounded-full transition-colors duration-200 text-gray-400 hover:bg-blue-500/20 hover:text-blue-300 cursor-pointer">
                                    <ImageIcon className="w-6 h-6" />
                                </label>
                                <input id="reference-image-upload" type="file" className="hidden" accept="image/*" onChange={handleReferenceImageSelect} />
                                
                                <button 
                                    type="button"
                                    onClick={handleImprovePrompt}
                                    disabled={isLoading || isImprovingPrompt}
                                    className="p-2 rounded-full transition-colors duration-200 text-gray-400 hover:bg-blue-500/20 hover:text-blue-300 disabled:hover:bg-transparent disabled:text-gray-600 disabled:cursor-not-allowed"
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
                        
                        {retouchReferenceImageUrl && (
                           <div className="w-full bg-gray-800/50 p-2 rounded-lg flex items-center justify-between animate-fade-in">
                               <div className="flex items-center gap-3">
                                   <img src={retouchReferenceImageUrl} className="w-12 h-12 object-cover rounded" alt="Reference preview" />
                                   <p className="text-sm text-gray-300 font-medium">Reference image selected.</p>
                               </div>
                               <button onClick={() => setRetouchReferenceImage(null)} className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
                                   <CloseIcon className="w-5 h-5" />
                               </button>
                           </div>
                        )}

                        <button 
                            type="button"
                            onClick={handleGenerate}
                            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !prompt.trim()}
                        >
                            Generate
                        </button>
                    </div>
                </div>
            )}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'expand' && <ExpandPanel onApplyExpand={handleApplyExpand} isLoading={isLoading} imageDimensions={imageDimensions} expandRect={expandRect} displayedImageRect={imgRef.current?.getBoundingClientRect() ?? null} />}
            {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} currentImage={currentImage} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} currentImage={currentImage} />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6 w-full">
            <button 
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Undo
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Redo
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label="Press and hold to see original image"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Compare
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Reset
            </button>
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Upload New
            </button>

            <div className="flex-grow flex flex-col sm:flex-row gap-3 sm:ml-auto w-full sm:w-auto mt-4 sm:mt-0">
                <button
                    onClick={handleUpscale}
                    disabled={isUpscaling || isLoading}
                    className="flex-grow w-full text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                >
                    Upscale <sup className="text-blue-400 font-bold text-xs -top-2">Beta</sup>
                </button>
                <button 
                    onClick={handleDownload}
                    className="flex-grow w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
                >
                    Download Image
                </button>
            </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header onLogoClick={handleLogoClick} />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentImage ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
        title="Leave Page?"
        message="You have unsaved changes. Are you sure you want to leave? Your edits will be lost."
      />
    </div>
  );
};

export default App;