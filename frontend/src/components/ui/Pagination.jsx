import { Button } from "./Button.jsx";

export function Pagination({ page, pageCount, onPageChange }) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3"
    >
      <Button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        variant="secondary"
      >
        Previous
      </Button>
      <span aria-live="polite" className="text-sm text-muted">
        Page {page} of {pageCount}
      </span>
      <Button
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        variant="secondary"
      >
        Next
      </Button>
    </nav>
  );
}
