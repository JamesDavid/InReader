import React, { useState, useEffect } from 'react';
import { PaginationService } from '../services/paginationService';
import { Pagination } from './Pagination';

interface ListItem {
  id: string;
  // ... other item properties
}

export const ExampleList: React.FC<{ items: ListItem[] }> = ({ items }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedState, setPaginatedState] = useState<PaginationState<ListItem>>({
    items: [],
    currentPage: 1,
    totalItems: 0,
    itemsPerPage: 20,
    totalPages: 0
  });

  const paginationService = new PaginationService<ListItem>(20);

  useEffect(() => {
    paginationService.setItems(items);
    setPaginatedState(paginationService.getState(currentPage));
  }, [items, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div>
      <div className="space-y-4">
        {paginatedState.items.map(item => (
          <div key={item.id}>
            {/* Render your item content here */}
          </div>
        ))}
      </div>

      <Pagination
        currentPage={paginatedState.currentPage}
        totalPages={paginatedState.totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}; 