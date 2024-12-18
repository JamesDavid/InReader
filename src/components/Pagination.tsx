import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  isLoading = false,
}) => {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    // Show pages around current page
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('...');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between space-x-2 my-4 px-4">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1 || isLoading}
          className={`px-3 py-1 rounded border disabled:opacity-50 transition-opacity
            ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
        >
          Previous
        </button>
        
        {getPageNumbers().map((page, index) => (
          <button
            key={index}
            onClick={() => typeof page === 'number' ? onPageChange(page) : null}
            disabled={page === '...' || isLoading || page === currentPage}
            className={`px-3 py-1 rounded border transition-opacity
              ${page === currentPage ? 'bg-blue-500 text-white' : ''}
              ${page === '...' ? 'cursor-default' : 'hover:bg-gray-100'}
              ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
              ${isLoading && page !== currentPage ? 'opacity-50' : ''}`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || isLoading}
          className={`px-3 py-1 rounded border disabled:opacity-50 transition-opacity
            ${isLoading ? 'cursor-wait' : 'cursor-pointer'}`}
        >
          Next
        </button>
      </div>
      {totalItems !== undefined && (
        <div className={`text-sm text-gray-600 transition-opacity ${isLoading ? 'opacity-50' : ''}`}>
          {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
        </div>
      )}
    </div>
  );
}; 