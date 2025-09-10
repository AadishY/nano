/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { ExclamationTriangleIcon } from './icons';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onConfirm, onCancel, title, message }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-md p-4"
      onClick={onCancel}
    >
      <div
        className="bg-gray-800/80 border border-gray-700 w-full max-w-md rounded-xl shadow-2xl p-6 md:p-8 flex flex-col gap-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-500/10 sm:mx-0 sm:h-10 sm:w-10">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" aria-hidden="true" />
          </div>
          <div className="text-left">
            <h3 className="text-xl font-bold text-gray-100">{title}</h3>
            <div className="mt-2">
              <p className="text-md text-gray-300">{message}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            className="w-full justify-center rounded-md bg-white/10 px-4 py-3 text-sm font-semibold text-gray-200 shadow-sm ring-1 ring-inset ring-white/20 hover:bg-white/20 sm:w-auto transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="w-full justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:w-auto transition-colors"
            onClick={onConfirm}
          >
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;