"""
Pagination helper — consistent paginated response wrapper across all list endpoints.
"""
from typing import Generic, List, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    total: int
    page: int
    page_size: int
    total_pages: int
    results: List[T]

    @classmethod
    def build(cls, items: list, total: int, page: int, page_size: int):
        import math
        return cls(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if page_size else 1,
            results=items,
        )