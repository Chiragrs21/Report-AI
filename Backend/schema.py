from pydantic import BaseModel


class Table(BaseModel):
    name: str
    description: str


class UserRequest(BaseModel):
    question: str
    context: dict = None
