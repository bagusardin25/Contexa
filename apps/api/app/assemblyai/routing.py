"""Speech-model routing (implementation guide §12–14).

The model follows the language being *spoken*. Translating into Indonesian is a
text step after transcription, so it never needs Indonesian STT.
"""

import json
from collections.abc import Sequence
from urllib.parse import urlencode

from app.models.session import SessionConfig, SpeakerLanguage, SpeechModel

SAMPLE_RATE = 16_000
ENCODING = "pcm_s16le"

_MODELS: dict[SpeakerLanguage, SpeechModel] = {
    "en": "universal-3-5-pro",
    "ja": "universal-3-5-pro",
    "multi": "universal-3-5-pro",  # native code-switching across the 18 core languages
    "id": "whisper-rt",  # Indonesian is outside the Universal-3.5 Pro Realtime set
    "auto": "whisper-rt",  # 99+ languages with built-in language detection
}


def speech_model_for(language: SpeakerLanguage) -> SpeechModel:
    return _MODELS[language]


def supports_keyterms(model: SpeechModel) -> bool:
    """Keyterms prompting is documented (and free) for Universal-3.5 Pro Realtime."""
    return model == "universal-3-5-pro"


def streaming_params(config: SessionConfig, keyterms: Sequence[str] = ()) -> dict[str, str]:
    """Query parameters for `wss://streaming.assemblyai.com/v3/ws` (PCM16 mono 16 kHz)."""
    model = speech_model_for(config.speaker_language)
    params = {
        "speech_model": model,
        "sample_rate": str(SAMPLE_RATE),
        "encoding": ENCODING,
    }
    if model == "universal-3-5-pro":
        # Formatting is always on for Universal-3.5 Pro, so format_turns isn't sent
        # (Universal Streaming → Universal-3.5 Pro migration guide).
        if config.speaker_labels:
            params["speaker_labels"] = "true"
        if keyterms:
            params["keyterms_prompt"] = json.dumps(list(keyterms), ensure_ascii=False)
    else:
        # whisper-rt detects the language itself and takes no language hint (guide §13).
        params["format_turns"] = "true"
    return params


def websocket_url(
    base_url: str, config: SessionConfig, token: str, keyterms: Sequence[str] = ()
) -> str:
    return f"{base_url}?{urlencode({**streaming_params(config, keyterms), 'token': token})}"
