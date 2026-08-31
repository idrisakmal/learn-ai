from .conversation import Conversation, build_system_prompt


class FakeProvider:
    """Stands in for the model so the loop can be tested without a network."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.seen = []

    def complete(self, messages, tools=None):
        self.seen.append([dict(m) for m in messages])
        return {"role": "assistant", "content": self.replies.pop(0)}


def test_messages_array_accumulates_both_roles_in_order():
    provider = FakeProvider(["first", "second"])
    conversation = Conversation(provider, "system prompt")

    conversation.send("hello")
    conversation.send("again")

    assert [m["role"] for m in conversation.messages] == [
        "system", "user", "assistant", "user", "assistant",
    ]


def test_earlier_turns_are_resent_so_the_model_can_remember():
    provider = FakeProvider(["first", "second"])
    conversation = Conversation(provider, "system prompt")

    conversation.send("my name is Idris")
    conversation.send("what is my name?")

    second_request = provider.seen[1]
    assert any(m["content"] == "my name is Idris" for m in second_request)


def test_system_prompt_folds_in_repo_instructions(tmp_path):
    (tmp_path / "AGENTS.md").write_text("Run tasks through make.", encoding="utf-8")

    class Cfg:
        code_dir = tmp_path

    prompt = build_system_prompt(Cfg())
    assert "Run tasks through make." in prompt
    assert "PAIR Agent" in prompt


def test_system_prompt_survives_a_repo_with_no_agents_md(tmp_path):
    class Cfg:
        code_dir = tmp_path

    assert "PAIR Agent" in build_system_prompt(Cfg())


from .tools import NO_ARGUMENTS, Tool, ToolRegistry


class ScriptedProvider:
    """Returns a prepared sequence of assistant turns, recording what it saw."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.seen = []

    def complete(self, messages, tools=None):
        self.seen.append([dict(m) for m in messages])
        return self.turns.pop(0)


def tool_call_turn(name, call_id="call-1", arguments="{}"):
    return {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": arguments},
            }
        ],
    }


def registry_with(name="repo_status", result="branch: main"):
    registry = ToolRegistry()
    registry.register(
        Tool(name=name, description="d", parameters=NO_ARGUMENTS, run=lambda _a: result)
    )
    return registry


def test_tool_result_is_appended_as_its_own_turn():
    provider = ScriptedProvider(
        [tool_call_turn("repo_status"), {"role": "assistant", "content": "you are on main"}]
    )
    conversation = Conversation(provider, "sys", tools=registry_with())

    reply = conversation.send("what branch am I on?")

    assert reply == "you are on main"
    assert [m["role"] for m in conversation.messages] == [
        "system", "user", "assistant", "tool", "assistant",
    ]
    tool_turn = conversation.messages[3]
    assert tool_turn["tool_call_id"] == "call-1"
    assert tool_turn["content"] == "branch: main"


def test_the_model_sees_the_tool_result_on_the_next_request():
    provider = ScriptedProvider(
        [tool_call_turn("repo_status"), {"role": "assistant", "content": "done"}]
    )
    Conversation(provider, "sys", tools=registry_with()).send("status?")

    second_request = provider.seen[1]
    assert any(m.get("role") == "tool" for m in second_request)


def test_every_call_in_a_parallel_tool_turn_gets_a_result():
    turn = tool_call_turn("repo_status")
    turn["tool_calls"].append(
        {
            "id": "call-2",
            "type": "function",
            "function": {"name": "repo_status", "arguments": "{}"},
        }
    )
    provider = ScriptedProvider([turn, {"role": "assistant", "content": "done"}])
    conversation = Conversation(provider, "sys", tools=registry_with())

    conversation.send("status twice")

    tool_turns = [m for m in conversation.messages if m["role"] == "tool"]
    assert {t["tool_call_id"] for t in tool_turns} == {"call-1", "call-2"}


def test_a_model_that_never_stops_calling_tools_is_cut_off():
    provider = ScriptedProvider([tool_call_turn("repo_status", f"c{i}") for i in range(20)])
    conversation = Conversation(provider, "sys", tools=registry_with())

    reply = conversation.send("loop forever")

    assert "without arriving at an answer" in reply


def test_no_tools_are_advertised_when_the_registry_is_empty():
    provider = ScriptedProvider([{"role": "assistant", "content": "hi"}])

    class Recorder(ScriptedProvider):
        pass

    captured = {}

    def complete(messages, tools=None):
        captured["tools"] = tools
        return {"role": "assistant", "content": "hi"}

    provider.complete = complete
    Conversation(provider, "sys").send("hello")

    assert captured["tools"] is None
