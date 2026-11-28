"""A photo per colourway.

The Matrix Master sheet shows one photo per STYLE: the garment, in whichever
colour it was shot in. The SY-AV sheet shows the same garments one row per
COLOUR, which is how the team reads what is actually available to sell — and
that needs a picture of each colour, not of the style.

`styles.photo_url` stays what it is: the style's own photo, the one the
Matrix card and the printed sheet draw. This column is beside it, not
instead of it, and a colourway without one simply has none — the SY-AV grid
says so rather than borrowing the style's and implying the colour was shot.

The same uploads volume and the same /uploads/<name> path as a style photo,
so nothing new is served and nothing new is backed up. The upload route
resizes identically (backend/app/routers/uploads.py).

Revision ID: 0033_colorway_photo
Revises: 0032_color_decisions
Create Date: 2026-11-28
"""
from alembic import op

revision = "0033_colorway_photo"
down_revision = "0032_color_decisions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE style_colorways ADD COLUMN photo_url text")
    op.execute("COMMENT ON COLUMN style_colorways.photo_url IS "
               "'This colour''s own photo, for the SY-AV sheet. Separate from "
               "styles.photo_url, which is the garment''s. Null means no "
               "photo of this colour — never fall back to the style''s and "
               "imply one was taken.'")


def downgrade() -> None:
    op.execute("ALTER TABLE style_colorways DROP COLUMN photo_url")
