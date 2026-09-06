# Urkunden-Zuarbeit

Agentische Zuarbeit für die Vorbereitung eines Grundstückskaufvertrags. Aus den Unterlagen
eines Vorgangs entsteht ein geprüfter Datensatz für die Urkunde: jeder Wert mit Fundstelle,
jeder Status mit Grund, jede Bestätigung durch einen Menschen.

## Starten

```bash
cp .env.example .env
docker compose up
```

## env konfigurieren

1. OpenRouter API-Key einfügen. Der Key kann unter [https://openrouter.ai/workspaces/default/keys](openrouter.ai/workspaces/default/keys) erstellt werden.
2. Ein multimodales Modell, das Bilder auslesen kann, auswählen. Modelle sind unter [https://openrouter.ai/models](openrouter.ai/models) gelistet. Standardmäßig ist Claude Sonnet 5 eingestellt.

Danach [http://localhost:3000](http://localhost:3000) öffnen.