export interface PaginationState<T> {
  items: T[];
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  totalPages: number;
}

export class PaginationService<T> {
  private allItems: T[] = [];
  private itemsPerPage: number;

  constructor(itemsPerPage: number = 20) {
    this.itemsPerPage = itemsPerPage;
  }

  setItems(items: T[]) {
    this.allItems = items;
  }

  getState(currentPage: number): PaginationState<T> {
    const totalItems = this.allItems.length;
    const totalPages = Math.ceil(totalItems / this.itemsPerPage);
    
    // Ensure current page is within bounds
    const validatedPage = Math.max(1, Math.min(currentPage, totalPages));
    
    const startIndex = (validatedPage - 1) * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
    
    return {
      items: this.allItems.slice(startIndex, endIndex),
      currentPage: validatedPage,
      totalItems,
      itemsPerPage: this.itemsPerPage,
      totalPages
    };
  }

  getPage(pageNumber: number): T[] {
    const startIndex = (pageNumber - 1) * this.itemsPerPage;
    const endIndex = Math.min(startIndex + this.itemsPerPage, this.allItems.length);
    return this.allItems.slice(startIndex, endIndex);
  }

  getCurrentPageItems(currentPage: number): T[] {
    return this.getPage(currentPage);
  }

  getTotalPages(): number {
    return Math.ceil(this.allItems.length / this.itemsPerPage);
  }
} 