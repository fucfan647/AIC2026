from __future__ import annotations

import time
from dataclasses import dataclass
import importlib.util
from pathlib import Path
import sys
import types
from typing import Any

import numpy as np

from .config import DEFAULT_MODEL_NAME, EMBEDDING_DIM


def l2_normalize(array: np.ndarray) -> np.ndarray:
    arr = np.asarray(array, dtype=np.float32)
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    return arr / np.clip(norms, 1e-12, None)


@dataclass(frozen=True)
class MetaClip2Config:
    model_name: str = DEFAULT_MODEL_NAME
    device: str = "cuda"
    dtype: str = "float16"
    local_files_only: bool = True


class MetaClip2Embedder:
    def __init__(self, config: MetaClip2Config):
        try:
            from transformers import AutoModel, AutoProcessor
            import torch
        except Exception as exc:
            raise RuntimeError("torch and transformers are required for MetaCLIP-2 search") from exc

        self.torch = torch
        self.device = config.device
        torch_dtype = torch.float16 if config.dtype == "float16" and config.device.startswith("cuda") else torch.float32
        print(f"[embedder] loading processor: {config.model_name}", flush=True)
        started = time.time()
        self.processor = AutoProcessor.from_pretrained(
            config.model_name,
            local_files_only=config.local_files_only,
            trust_remote_code=True,
        )
        print(f"[embedder] processor loaded in {time.time() - started:.2f}s", flush=True)
        print(f"[embedder] loading model: {config.model_name}", flush=True)
        started = time.time()
        self.model = AutoModel.from_pretrained(
            config.model_name,
            torch_dtype=torch_dtype,
            local_files_only=config.local_files_only,
            trust_remote_code=True,
        ).to(config.device)
        self.model.eval()
        print(f"[embedder] model loaded in {time.time() - started:.2f}s", flush=True)

    def _to_device(self, inputs: dict[str, Any]) -> dict[str, Any]:
        return {key: value.to(self.device) if hasattr(value, "to") else value for key, value in inputs.items()}

    def _sync(self) -> None:
        if self.device.startswith("cuda") and self.torch.cuda.is_available():
            self.torch.cuda.synchronize()

    def encode_text_profiled(self, text: str):
        tokenize_started = time.perf_counter()
        inputs = self.processor(text=[text], padding=True, truncation=True, return_tensors="pt")
        tokenize_ms = (time.perf_counter() - tokenize_started) * 1000.0

        transfer_started = time.perf_counter()
        inputs = self._to_device(inputs)
        self._sync()
        input_to_gpu_ms = (time.perf_counter() - transfer_started) * 1000.0

        forward_started = time.perf_counter()
        with self.torch.no_grad():
            if hasattr(self.model, "get_text_features"):
                emb = self.model.get_text_features(**inputs)
            else:
                emb = self.model(**inputs)
            if not isinstance(emb, self.torch.Tensor):
                if hasattr(emb, "pooler_output") and emb.pooler_output is not None:
                    emb = emb.pooler_output
                elif hasattr(emb, "text_embeds") and emb.text_embeds is not None:
                    emb = emb.text_embeds
                elif hasattr(emb, "last_hidden_state") and emb.last_hidden_state is not None:
                    emb = emb.last_hidden_state[:, 0, :]
                else:
                    raise RuntimeError("model output does not expose text embeddings")
        self._sync()
        model_forward_ms = (time.perf_counter() - forward_started) * 1000.0

        post_started = time.perf_counter()
        emb = emb / emb.norm(dim=-1, keepdim=True).clamp_min(1e-12)
        arr = emb.detach().float().cpu().numpy().astype(np.float32)
        arr = l2_normalize(arr)
        if arr.shape != (1, EMBEDDING_DIM):
            raise ValueError(f"text embedding shape must be (1, {EMBEDDING_DIM}), got {arr.shape}")
        embedding_postprocess_ms = (time.perf_counter() - post_started) * 1000.0

        return arr[0], {
            "tokenize_ms": round(tokenize_ms, 3),
            "input_to_gpu_ms": round(input_to_gpu_ms, 3),
            "model_forward_ms": round(model_forward_ms, 3),
            "embedding_postprocess_ms": round(embedding_postprocess_ms, 3),
        }


@dataclass(frozen=True)
class Beit3Config:
    runtime_python_path: Path
    checkpoint: Path
    sentencepiece_model: Path
    device: str = "cuda"
    max_text_length: int = 64
    embedding_dim: int = 1024


class Beit3Embedder:
    def __init__(self, config: Beit3Config):
        for path, label in (
            (config.runtime_python_path, "BEiT-3 Python runtime"),
            (config.checkpoint, "BEiT-3 checkpoint"),
            (config.sentencepiece_model, "BEiT-3 sentencepiece model"),
        ):
            if not path.exists():
                raise FileNotFoundError(f"{label} not found: {path}")
        if config.max_text_length < 3:
            raise ValueError("BEiT-3 max text length must be at least 3")

        runtime_python_path = str(config.runtime_python_path.resolve())
        if runtime_python_path not in sys.path:
            sys.path.insert(0, runtime_python_path)
        try:
            import torch
            from transformers.models.xlm_roberta.tokenization_xlm_roberta import XLMRobertaTokenizer
        except Exception as exc:
            raise RuntimeError("torch, transformers, and sentencepiece are required for BEiT-3 search") from exc

        timm_shim_names = []
        if importlib.util.find_spec("torchvision") is None and "timm" not in sys.modules:
            def drop_path(x, drop_prob=0.0, training=False):
                if drop_prob == 0.0 or not training:
                    return x
                keep_prob = 1.0 - drop_prob
                shape = (x.shape[0],) + (1,) * (x.ndim - 1)
                random_tensor = keep_prob + torch.rand(shape, dtype=x.dtype, device=x.device)
                return x.div(keep_prob) * random_tensor.floor()

            timm_module = types.ModuleType("timm")
            timm_models_module = types.ModuleType("timm.models")
            timm_layers_module = types.ModuleType("timm.models.layers")
            timm_layers_module.drop_path = drop_path
            timm_module.models = timm_models_module
            timm_models_module.layers = timm_layers_module
            for name, module in (
                ("timm", timm_module),
                ("timm.models", timm_models_module),
                ("timm.models.layers", timm_layers_module),
            ):
                sys.modules[name] = module
                timm_shim_names.append(name)
        try:
            import torch.nn as nn
            import torch.nn.functional as F
            from torchscale.architecture.config import EncoderConfig
            from torchscale.model.BEiT3 import BEiT3
        except Exception as exc:
            raise RuntimeError(
                f"Cannot import torchscale from {config.runtime_python_path}"
            ) from exc
        finally:
            for name in reversed(timm_shim_names):
                sys.modules.pop(name, None)

        class BEiT3ITCRetrieval(nn.Module):
            def __init__(self, img_size: int = 224):
                super().__init__()
                model_config = EncoderConfig(
                    img_size=img_size,
                    patch_size=16,
                    vocab_size=64010,
                    multiway=True,
                    layernorm_embedding=False,
                    normalize_output=True,
                    no_output_layer=True,
                    drop_path_rate=0,
                    encoder_embed_dim=config.embedding_dim,
                    encoder_attention_heads=16,
                    encoder_ffn_embed_dim=config.embedding_dim * 4,
                    encoder_layers=24,
                    checkpoint_activations=None,
                )
                self.beit3 = BEiT3(model_config)
                self.language_head = nn.Linear(config.embedding_dim, config.embedding_dim, bias=False)
                self.vision_head = nn.Linear(config.embedding_dim, config.embedding_dim, bias=False)
                self.logit_scale = nn.Parameter(torch.ones([]) * np.log(1 / 0.07))

            def forward(self, text_description, padding_mask):
                output = self.beit3(
                    textual_tokens=text_description,
                    visual_tokens=None,
                    text_padding_position=padding_mask,
                )
                embedding = self.language_head(output["encoder_out"][:, 0, :])
                return F.normalize(embedding, dim=-1)

        self.torch = torch
        self.device = config.device
        self.max_text_length = config.max_text_length
        self.embedding_dim = config.embedding_dim
        print(f"[embedder] loading BEiT-3 tokenizer: {config.sentencepiece_model}", flush=True)
        import sentencepiece as spm
        self.sp = spm.SentencePieceProcessor(model_file=str(config.sentencepiece_model))

        print(f"[embedder] loading BEiT-3 model: {config.checkpoint}", flush=True)
        started = time.time()
        checkpoint = torch.load(config.checkpoint, map_location="cpu", weights_only=False)
        state_dict = checkpoint.get("model", checkpoint)
        pos_weight = state_dict.get("beit3.encoder.embed_positions.A.weight")
        detected_img_size = 224
        if pos_weight is not None and pos_weight.shape[0] == 579:
            detected_img_size = 384
            print("[embedder] detected 384x384 checkpoint (COCO/Flickr30k)", flush=True)
        self.model = BEiT3ITCRetrieval(img_size=detected_img_size)
        self.model.load_state_dict(state_dict, strict=True)
        self.model = self.model.to(config.device)
        self.model.eval()
        print(f"[embedder] BEiT-3 model loaded in {time.time() - started:.2f}s", flush=True)

    def _sync(self) -> None:
        if self.device.startswith("cuda") and self.torch.cuda.is_available():
            self.torch.cuda.synchronize()

    def encode_text_profiled(self, text: str):
        tokenize_started = time.perf_counter()
        pieces = self.sp.encode(text, out_type=str)
        token_ids = []
        for piece in pieces:
            sp_id = self.sp.piece_to_id(piece)
            if sp_id == 0:
                token_ids.append(3)
            elif sp_id == 1:
                token_ids.append(0)
            elif sp_id == 2:
                token_ids.append(2)
            else:
                token_ids.append(sp_id + 1)
        token_ids = token_ids[: self.max_text_length - 2]
        if not token_ids:
            token_ids = [3]
        bos_id = 0
        eos_id = 2
        pad_id = 1
        language_tokens = [bos_id] + token_ids + [eos_id]
        padding_size = self.max_text_length - len(language_tokens)
        if padding_size > 0:
            padding_mask = [0] * len(language_tokens) + [1] * padding_size
            language_tokens = language_tokens + [pad_id] * padding_size
        else:
            padding_mask = [0] * len(language_tokens)
        tokenize_ms = (time.perf_counter() - tokenize_started) * 1000.0

        transfer_started = time.perf_counter()
        language_tokens = self.torch.tensor([language_tokens], dtype=self.torch.long, device=self.device)
        padding_mask = self.torch.tensor([padding_mask], dtype=self.torch.long, device=self.device)
        self._sync()
        input_to_gpu_ms = (time.perf_counter() - transfer_started) * 1000.0

        forward_started = time.perf_counter()
        with self.torch.no_grad():
            embedding = self.model(
                text_description=language_tokens,
                padding_mask=padding_mask,
            )
        self._sync()
        model_forward_ms = (time.perf_counter() - forward_started) * 1000.0

        post_started = time.perf_counter()
        arr = embedding.detach().float().cpu().numpy().astype(np.float32)
        arr = l2_normalize(arr)
        if arr.shape != (1, self.embedding_dim):
            raise ValueError(
                f"BEiT-3 text embedding shape must be (1, {self.embedding_dim}), got {arr.shape}"
            )
        embedding_postprocess_ms = (time.perf_counter() - post_started) * 1000.0
        return arr[0], {
            "tokenize_ms": round(tokenize_ms, 3),
            "input_to_gpu_ms": round(input_to_gpu_ms, 3),
            "model_forward_ms": round(model_forward_ms, 3),
            "embedding_postprocess_ms": round(embedding_postprocess_ms, 3),
        }
