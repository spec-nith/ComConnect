import argparse
import json
import sys
import types
from pathlib import Path

from app import create_app
from app.chains import answer_question
from app.rag import _embeddings


def _load_cases(path):
    cases = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            item = json.loads(line)
            if not item.get("workspace_id") or not item.get("question"):
                raise ValueError(
                    f"Case on line {line_number} needs workspace_id and question"
                )
            cases.append(item)
    return cases


def _build_dataset(cases):
    rows = []
    app = create_app()
    with app.app_context():
        for item in cases:
            answer, documents = answer_question(
                item["workspace_id"],
                item["question"],
            )
            row = {
                "question": item["question"],
                "answer": answer,
                "contexts": [document.page_content for document in documents],
            }
            if item.get("ground_truth"):
                row["ground_truth"] = item["ground_truth"]
            rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate ComConnect workspace RAG with RAGAS."
    )
    parser.add_argument(
        "dataset",
        help=(
            "JSONL file with workspace_id, question, and optional ground_truth "
            "fields."
        ),
    )
    parser.add_argument(
        "--output",
        help="Optional JSON file path for the metric output.",
    )
    args = parser.parse_args()

    if "langchain_community.chat_models.vertexai" not in sys.modules:
        vertexai_module = types.ModuleType("langchain_community.chat_models.vertexai")

        class ChatVertexAI:
            pass

        vertexai_module.ChatVertexAI = ChatVertexAI
        sys.modules["langchain_community.chat_models.vertexai"] = vertexai_module

    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import (
            answer_relevancy,
            context_precision,
            context_recall,
            faithfulness,
        )
        from app.chains import _model, _ollama_model
    except ImportError as error:
        raise SystemExit(
            "Install ai-service requirements with ragas support before running "
            f"evaluation: {error}"
        )

    rows = _build_dataset(_load_cases(args.dataset))
    has_ground_truth = any("ground_truth" in row for row in rows)
    metrics = [faithfulness, answer_relevancy, context_precision]
    if has_ground_truth:
        metrics.append(context_recall)

    app = create_app()
    with app.app_context():
        judge_model = (
            _ollama_model()
            if app.config.get("LLM_PROVIDER") == "ollama"
            else _model()
        )
        result = evaluate(
            Dataset.from_list(rows),
            metrics=metrics,
            llm=LangchainLLMWrapper(judge_model),
            embeddings=LangchainEmbeddingsWrapper(_embeddings()),
        )
    output = result.to_pandas().to_dict(orient="records")
    payload = {"scores": output}

    if args.output:
        Path(args.output).write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )
    else:
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
