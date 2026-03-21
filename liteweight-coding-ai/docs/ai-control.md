# AI Control

## Best prompt request

Apply system prompt to the model.
```JSON
{
    "system": "You must ALWAYS respond in the SAME language as the user's input. If the user writes in Vietnamese, respond in Vietnamese. If English, respond in English. Never use Chinese unless explicitly asked."
}
```

The best prompt request options for the model coder.

```JSON
{
    "options":{
        "num_keep": 24,
        "seed": 42,

        "num_predict": 512,

        "temperature": 0.2,
        "top_k": 40,
        "top_p": 0.9,
        "min_p": 0.05,
        "typical_p": 1.0,

        "repeat_last_n": 64,
        "repeat_penalty": 1.1,
        "presence_penalty": 0.0,
        "frequency_penalty": 0.0,
        "penalize_newline": false,

        "stop": [
            "\n\n\n",
            "```output",
            "END"
        ],

        "num_ctx": 4096,
        "num_batch": 8,

        "num_gpu": 1,
        "main_gpu": 0,
        "use_mmap": true,
        "num_thread": 8
    }
}

```