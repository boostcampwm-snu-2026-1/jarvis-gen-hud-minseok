"""하이브리드 음성 라우팅 오케스트레이터 (워크스테이션 로컬 서비스).

지금 단계(STT/TTS 보류): 텍스트 입력 → 로컬 Qwen 라우터 → (병렬) 로컬 즉답 + 클라우드 Hermes.
설계: docs/briefs/M5-hybrid-voice-routing.md
"""
