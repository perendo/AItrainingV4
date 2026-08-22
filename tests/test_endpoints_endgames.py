import pytest
from app.models.endgame import EndgameLesson, LessonCategory


@pytest.fixture
def seeded_lesson(db_session):
    lesson = EndgameLesson(
        slug="test-final-1",
        title="Final 1 - El Cuadrado del Peón",
        category=LessonCategory.PEONES,
        difficulty="principiante",
        initial_fen="6k1/8/8/8/8/8/P7/7K w - - 0 1",
        target_result="win",
        lesson_number=1,
        chapter_name="Final 1 - El Cuadrado del Peón",
        concept="El Cuadrado del Peón",
        pgn_content="[White \"Final 1\"]\n1. a4 Kf7 1-0",
        main_line=["a4", "Kf7"],
        initial_comment="Texto introductorio de la lección.",
        theory_tree=[
            {
                "san": "a4",
                "uci": "a2a4",
                "ply": 1,
                "turn": "w",
                "comment": "Comentario de la jugada.",
                "nags": [1],
                "variations": [
                    [
                        {
                            "san": "a3",
                            "uci": "a2a3",
                            "ply": 1,
                            "turn": "w",
                            "comment": "Variante alternativa.",
                            "nags": [],
                            "variations": [],
                        }
                    ]
                ],
            }
        ],
        final_comment="Conclusión teórica de la lección.",
    )
    db_session.add(lesson)
    db_session.commit()
    return lesson


def test_list_lessons_includes_new_fields(client, auth_headers, seeded_lesson):
    resp = client.get("/api/v1/endgames/lessons", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # El catálogo está agrupado por categoría.
    items = data.get("peones") or []
    match = next((i for i in items if i["slug"] == "test-final-1"), None)
    assert match is not None
    assert match["lesson_number"] == 1
    assert match["concept"] == "El Cuadrado del Peón"


def test_detail_lesson_returns_theory_fields(client, auth_headers, seeded_lesson):
    resp = client.get(
        f"/api/v1/endgames/lessons/{seeded_lesson.slug}", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["lesson_number"] == 1
    assert data["chapter_name"] == "Final 1 - El Cuadrado del Peón"
    assert data["concept"] == "El Cuadrado del Peón"
    assert data["pgn_content"].startswith("[White")
    assert data["main_line"] == ["a4", "Kf7"]
    assert data["initial_comment"] == "Texto introductorio de la lección."
    assert data["final_comment"] == "Conclusión teórica de la lección."

    tree = data["theory_tree"]
    assert isinstance(tree, list) and len(tree) == 1
    node = tree[0]
    assert node["san"] == "a4"
    assert node["nags"] == [1]
    assert node["comment"] == "Comentario de la jugada."
    assert node["variations"][0][0]["san"] == "a3"


def test_detail_lesson_not_found(client, auth_headers):
    resp = client.get("/api/v1/endgames/lessons/no-existe", headers=auth_headers)
    assert resp.status_code == 404
