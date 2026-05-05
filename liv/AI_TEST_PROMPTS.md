# Nexus AI A-Z Test Prompts

## Command Tests

### 1. Help Command
```
/help
```
Expected: Shows all available commands in English

### 2. Think Level Commands
```
/think
/think off
/think minimal
/think medium
/think high
/think xhigh
```
Expected: Shows/sets thinking level with English responses

### 3. Verbose Level Commands
```
/verbose
/verbose off
/verbose on
/verbose full
```
Expected: Shows/sets verbose level with English responses

### 4. Model Tier Commands
```
/model
/model flash
/model haiku
/model sonnet
/model opus
```
Expected: Shows/sets model tier with English responses

### 5. Status Command
```
/status
```
Expected: Shows current settings in English

### 6. Reset Command
```
/reset
```
Expected: Resets all settings to defaults with English confirmation

### 7. Stats Command
```
/stats
```
Expected: Shows usage statistics in English

---

## Basic AI Capability Tests

### 8. Simple Greeting
```
Hello, how are you?
```
Expected: Natural conversational response

### 9. Math Calculation
```
What is 15 * 23 + 47?
```
Expected: 392

### 10. Date/Time Awareness
```
What's today's date?
```
Expected: Current date (Feb 1, 2026)

### 11. Language Understanding
```
Translate "Hello, how are you?" to Turkish
```
Expected: "Merhaba, nasılsın?"

### 12. Code Generation
```
Write a simple Python function that calculates factorial
```
Expected: Working Python factorial function

### 13. Code Explanation
```
Explain what this code does: arr.filter(x => x > 0).map(x => x * 2)
```
Expected: Clear explanation of filter and map operations

### 14. JSON Generation
```
Create a JSON object for a user with name, email, and age
```
Expected: Valid JSON structure

### 15. Summarization
```
Summarize in one sentence: Artificial intelligence has transformed how businesses operate, enabling automation of repetitive tasks, improving customer service through chatbots, and providing insights through data analysis.
```
Expected: Concise one-sentence summary

---

## Tool Usage Tests

### 16. Web Search
```
What are the latest developments in AI in 2026?
```
Expected: Uses web search tool and provides current info

### 17. System Information
```
What operating system are you running on?
```
Expected: Reports system information

### 18. File Operations (if enabled)
```
List the files in the current directory
```
Expected: Uses shell tool to list files

---

## Multi-Turn Conversation Tests

### 19. Context Retention
```
Turn 1: My name is Alex
Turn 2: What's my name?
```
Expected: Remembers "Alex" from previous turn

### 20. Follow-up Questions
```
Turn 1: What is the capital of France?
Turn 2: What's the population?
```
Expected: Understands context and answers about Paris

---

## Thinking Level Tests

### 21. Quick Response (think off)
```
/think off
What is 2+2?
```
Expected: Short, direct answer "4"

### 22. Deep Analysis (think high)
```
/think high
What are the pros and cons of microservices architecture?
```
Expected: Detailed analysis with multiple perspectives

---

## Verbose Level Tests

### 23. Silent Mode
```
/verbose off
Calculate 100 divided by 4
```
Expected: Just "25", no explanation

### 24. Full Verbose Mode
```
/verbose full
Calculate 100 divided by 4
```
Expected: Full explanation of the calculation process

---

## Edge Cases

### 25. Empty Message Handling
```
(send empty message)
```
Expected: Graceful handling, no crash

### 26. Very Long Input
```
(send 5000+ character message)
```
Expected: Handles without timeout

### 27. Special Characters
```
Test special chars: <>&"'\/
```
Expected: Handles properly without breaking

### 28. Unicode/Emoji
```
Test emoji: 🎉🚀💡 and Turkish: çğıöşü
```
Expected: Displays correctly

### 29. Invalid Command
```
/invalidcommand
```
Expected: Passes to AI instead of erroring

### 30. Rapid Messages
```
(send 5 messages rapidly)
```
Expected: Queues and processes in order

---

## Platform-Specific Tests

### 31. WhatsApp Formatting
```
Test *bold* and _italic_ formatting
```
Expected: Responds with proper WhatsApp markdown

### 32. Telegram Formatting
```
Test **bold** and __italic__ formatting
```
Expected: Responds with proper Telegram markdown

---

## Session Persistence Tests

### 33. Preference Persistence
```
/think high
(disconnect and reconnect)
/status
```
Expected: Thinking level remains "high"

### 34. Stats Accumulation
```
(send multiple messages)
/stats
```
Expected: Message count and token count increase

---

## Error Handling Tests

### 35. Invalid Think Level
```
/think invalid
```
Expected: Error message listing valid levels

### 36. Invalid Model Tier
```
/model gpt5
```
Expected: Error message listing valid tiers

---

## Performance Tests

### 37. Response Time (Simple)
```
What is 1+1?
```
Expected: Response within 2 seconds

### 38. Response Time (Complex)
```
Write a 500-word essay about climate change
```
Expected: Response within 30 seconds

---

## Test Execution Checklist

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | /help | [ ] | |
| 2 | /think levels | [ ] | |
| 3 | /verbose levels | [ ] | |
| 4 | /model tiers | [ ] | |
| 5 | /status | [ ] | |
| 6 | /reset | [ ] | |
| 7 | /stats | [ ] | |
| 8 | Greeting | [ ] | |
| 9 | Math | [ ] | |
| 10 | Date | [ ] | |
| 11 | Translation | [ ] | |
| 12 | Code gen | [ ] | |
| 13 | Code explain | [ ] | |
| 14 | JSON gen | [ ] | |
| 15 | Summarize | [ ] | |
| 16 | Web search | [ ] | |
| 17 | System info | [ ] | |
| 18 | File ops | [ ] | |
| 19 | Context | [ ] | |
| 20 | Follow-up | [ ] | |
| 21 | Think off | [ ] | |
| 22 | Think high | [ ] | |
| 23 | Verbose off | [ ] | |
| 24 | Verbose full | [ ] | |
| 25 | Empty msg | [ ] | |
| 26 | Long input | [ ] | |
| 27 | Special chars | [ ] | |
| 28 | Unicode | [ ] | |
| 29 | Invalid cmd | [ ] | |
| 30 | Rapid msgs | [ ] | |
| 31 | WA format | [ ] | |
| 32 | TG format | [ ] | |
| 33 | Persistence | [ ] | |
| 34 | Stats | [ ] | |
| 35 | Invalid think | [ ] | |
| 36 | Invalid model | [ ] | |
| 37 | Simple speed | [ ] | |
| 38 | Complex speed | [ ] | |
