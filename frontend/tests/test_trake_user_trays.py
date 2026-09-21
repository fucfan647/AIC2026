from pathlib import Path

from fastapi.testclient import TestClient

from frontend.serve_frontend import create_app


def test_captured_trake_frames_are_isolated_by_user_and_visible_in_team_state(tmp_path: Path):
    state_path = tmp_path / "team_state.json"
    capture_dir = tmp_path / "captures"
    app = create_app(
        backend_url="http://127.0.0.1:9",
        records_path=tmp_path / "missing_records.sqlite",
        team_state_path=state_path,
        team_capture_dir=capture_dir,
    )

    with TestClient(app) as client:
        response = client.post("/team/member", json={"client_id": "charlie-id", "name": "Charlie"})
        assert response.status_code == 200
        assert response.json()["trake_users"]["charlie-id"]["frames"] == []

        for client_id, name, frame_id in (("alice-id", "Alice", 120), ("bob-id", "Bob", 240)):
            response = client.post(
                "/team/capture",
                params={
                    "client_id": client_id,
                    "name": name,
                    "video_id": "L21_V001",
                    "frame_id": frame_id,
                    "timestamp_ms": frame_id * 40,
                    "fps": 25,
                    "target": "trake_user",
                    "event": 2,
                },
                content=b"jpeg-data",
                headers={"Content-Type": "image/jpeg"},
            )
            assert response.status_code == 200

        team_state = client.get("/team/state").json()
        assert set(team_state["trake_users"]) == {"alice-id", "bob-id", "charlie-id"}
        assert team_state["trake_users"]["alice-id"]["name"] == "Alice"
        assert team_state["trake_users"]["bob-id"]["name"] == "Bob"
        assert team_state["trake_users"]["alice-id"]["frames"][0]["item"]["frame_id"] == 120
        assert team_state["trake_users"]["bob-id"]["frames"][0]["item"]["frame_id"] == 240
        assert team_state["trake_frames"] == []

        alice_frame = team_state["trake_users"]["alice-id"]["frames"][0]
        alice_capture = capture_dir / Path(alice_frame["item"]["image_url"]).name
        assert alice_capture.is_file()

        response = client.post(
            "/team/trake/user-frame/remove",
            json={"client_id": "alice-id", "selection_id": alice_frame["selection_id"]},
        )
        assert response.status_code == 200
        assert response.json()["trake_users"]["alice-id"]["frames"] == []
        assert not alice_capture.exists()

        response = client.post(
            "/team/capture",
            params={
                "client_id": "bob-id",
                "name": "Bob",
                "video_id": "L21_V001",
                "frame_id": 240,
                "timestamp_ms": 9600,
                "fps": 25,
                "target": "team",
            },
            content=b"jpeg-data",
            headers={"Content-Type": "image/jpeg"},
        )
        assert response.status_code == 200
        bob_vote = next(vote for vote in response.json()["votes"] if vote["client_id"] == "bob-id")
        bob_vote_capture = capture_dir / Path(bob_vote["item"]["image_url"]).name
        bob_trake_capture = capture_dir / Path(
            response.json()["trake_users"]["bob-id"]["frames"][0]["item"]["image_url"]
        ).name
        assert bob_vote_capture.is_file()
        assert bob_trake_capture.is_file()

        response = client.post("/team/trake/user/remove", json={"client_id": "bob-id"})
        assert response.status_code == 200
        assert "bob-id" not in response.json()["trake_users"]
        assert all(vote["client_id"] != "bob-id" for vote in response.json()["votes"])
        assert not bob_vote_capture.exists()
        assert not bob_trake_capture.exists()
