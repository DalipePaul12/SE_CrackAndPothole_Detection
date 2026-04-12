from pydantic import BaseModel, ConfigDict


class AppBaseModel(BaseModel):
    """
    Base model for all schemas.
    - from_attributes=True allows ORM model → Pydantic conversion
    - populate_by_name=True allows both alias and field name
    """
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )