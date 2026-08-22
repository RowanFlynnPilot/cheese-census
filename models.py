"""Pydantic models mirroring SCHEMA.md.

Every enum outside structural literals lives in data/vocab/tags.json.
An unknown value anywhere is a validation error, and validation errors
are build-fatal. That is the design, not a limitation.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parent
VOCAB: dict[str, list[str]] = json.loads(
    (ROOT / "data" / "vocab" / "tags.json").read_text(encoding="utf-8")
)

CLASSIFICATIONS = ("creamery", "commodity", "processor", "excluded")


def _require(values: str | list[str], key: str, field: str) -> None:
    items = [values] if isinstance(values, str) else values
    unknown = [v for v in items if v not in VOCAB[key]]
    if unknown:
        raise ValueError(
            f"{field}: unknown {key} value(s) {unknown} — "
            f"fix the record, or add the term to data/vocab/tags.json deliberately"
        )


class Plant(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datcp_id: str
    address: str
    city: str
    county: str
    operations: list[str]


class Retail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    store: bool
    mail_order: bool
    online: bool


class Editorial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str | None = None
    visit_notes: str | None = None
    photo: str | None = None


class Creamery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    aka: list[str] = []
    city: str
    # County comes from DATCP, so it is unknown for a company DFW lists that holds no
    # Wisconsin plant licence (Biery is Ohio, Cypress Grove California).
    county: str | None = None
    # SCHEMA.md requires lat/lng on an *exported* creamery — that is validation #5, and
    # build.validate() enforces it there. They stay optional on the model because a
    # creamery exists in the working dataset long before it is geocoded and pinned via
    # an override, and only `creamery`-classified rows are ever exported.
    lat: float | None = None
    lng: float | None = None
    address: str
    website: str | None = None
    retail: Retail
    plants: list[Plant] = []
    dfw_company_id: int | None = None
    founded: int | None = None
    status: Literal["active", "closed"] = "active"
    editorial: Editorial = Editorial()


class SimilarRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cheese_id: str
    score: float


class Cheese(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    creamery_id: str
    family: str
    milk: list[str] = Field(min_length=1)
    texture: str
    age_band: str
    rind: str
    flavor: list[str] = Field(min_length=2, max_length=6)
    add_ins: list[str] = []
    raw_milk: bool | None = None
    trademarked: bool = False
    wisconsin_original: bool = False
    description: str | None = None
    description_generated: bool = True
    image: str | None = None
    similar: list[SimilarRef] = []

    @field_validator("family")
    @classmethod
    def _family(cls, v: str) -> str:
        _require(v, "family", "cheese.family")
        return v

    @field_validator("milk")
    @classmethod
    def _milk(cls, v: list[str]) -> list[str]:
        _require(v, "milk", "cheese.milk")
        return v

    @field_validator("texture")
    @classmethod
    def _texture(cls, v: str) -> str:
        _require(v, "texture", "cheese.texture")
        return v

    @field_validator("age_band")
    @classmethod
    def _age_band(cls, v: str) -> str:
        _require(v, "age_band", "cheese.age_band")
        return v

    @field_validator("rind")
    @classmethod
    def _rind(cls, v: str) -> str:
        _require(v, "rind", "cheese.rind")
        return v

    @field_validator("flavor")
    @classmethod
    def _flavor(cls, v: list[str]) -> list[str]:
        _require(v, "flavor", "cheese.flavor")
        return v

    @field_validator("add_ins")
    @classmethod
    def _add_ins(cls, v: list[str]) -> list[str]:
        _require(v, "add_ins", "cheese.add_ins")
        return v

    @model_validator(mode="after")
    def _id_shape(self) -> "Cheese":
        prefix = f"{self.creamery_id}--"
        if not self.id.startswith(prefix):
            raise ValueError(
                f"cheese id '{self.id}' must start with '{prefix}' "
                f"(convention: {{creamery-id}}--{{cheese-slug}})"
            )
        return self


class Certification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    year: int | None = None

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        _require(v, "mc_certifications", "certification.type")
        return v


class Person(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    creamery_ids: list[str] = Field(min_length=1)
    certifications: list[Certification] = Field(min_length=1)
    active: bool


class AwardEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cheese_name: str
    maker: str
    company: str
    city: str


class Award(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    contest: Literal["wccc", "uscc"]
    year: int
    class_number: int
    class_name: str
    placement: int = Field(ge=1, le=3)
    finalist: bool = False
    champion: bool = False
    score: float | None = None
    entry: AwardEntry
    creamery_id: str | None = None
    cheese_id: str | None = None


class Highlight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cheese_id: str
    type: Literal["editorial", "sponsored"]
    label: str
    sponsor: str | None = None
    starts: str
    ends: str

    @field_validator("starts", "ends")
    @classmethod
    def _iso_date(cls, v: str) -> str:
        date.fromisoformat(v)  # raises on malformed dates
        return v

    @model_validator(mode="after")
    def _sponsor_rule(self) -> "Highlight":
        if (self.type == "sponsored") != (self.sponsor is not None):
            raise ValueError(
                "highlight: 'sponsor' is required when type='sponsored' and forbidden otherwise"
            )
        return self


class CrosswalkEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["datcp", "dfw", "masters", "contests"]
    source_key: str
    # None is a reviewed exclusion — "this record resolves to no canonical company,
    # deliberately" (a maple-syrup outfit entering a contest, a master's unlicensed
    # retail brand, an out-of-state entrant). Only a human may say so, hence manual.
    creamery_id: str | None
    method: Literal["auto", "manual"]

    @model_validator(mode="after")
    def _exclusion_is_manual(self) -> "CrosswalkEntry":
        if self.creamery_id is None and self.method != "manual":
            raise ValueError(
                "crosswalk: a null creamery_id is a reviewed exclusion and must be method='manual'"
            )
        return self
