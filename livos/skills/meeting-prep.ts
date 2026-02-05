/**
---
name: meeting-prep
description: Intelligent meeting preparation - summarizes context, generates talking points, prepares action items
version: 1.0.0
type: autonomous
triggers:
  - ^(prepare|prep)\s+(for\s+)?(a\s+)?meeting
  - meeting\s+(prep|preparation|summary)
  - ^(get\s+ready|ready)\s+for\s+meeting
  - talking\s+points\s+for
phases:
  - research
  - execute
tools:
  - memory_search
  - memory_add
model_tier: sonnet
max_tokens: 6000
timeout_ms: 120000
---
*/

import type { SkillContext, SkillResult } from '@nexus/core/lib';

// ============================================================================
// TYPES
// ============================================================================

interface MeetingRequest {
  topic: string;
  participants?: string[];
  meetingType: MeetingType;
  duration?: number;
  objectives?: string[];
  context?: string;
}

type MeetingType =
  | 'standup'
  | 'one_on_one'
  | 'team_meeting'
  | 'client_meeting'
  | 'presentation'
  | 'brainstorm'
  | 'review'
  | 'planning'
  | 'interview'
  | 'general';

interface MeetingPrep {
  summary: string;
  keyContext: ContextItem[];
  talkingPoints: TalkingPoint[];
  questionsToAsk: string[];
  potentialConcerns: string[];
  suggestedAgenda?: AgendaItem[];
  followUpActions: string[];
}

interface ContextItem {
  topic: string;
  details: string;
  source?: string;
  relevance: 'high' | 'medium' | 'low';
}

interface TalkingPoint {
  point: string;
  supporting: string[];
  priority: 'must_mention' | 'should_mention' | 'if_time';
}

interface AgendaItem {
  item: string;
  duration: number;
  owner?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const { message } = ctx;

  try {
    // Phase 1: Parse request and gather context
    ctx.sendProgress?.('Analyzing meeting request...');
    const request = await parseMeetingRequest(ctx, message);

    // Phase 2: Search memory for relevant context
    ctx.sendProgress?.('Searching for relevant context...');
    const relevantContext = await gatherContext(ctx, request);

    // Phase 3: Generate meeting preparation
    ctx.sendProgress?.('Generating meeting preparation...');
    const prep = await generateMeetingPrep(ctx, request, relevantContext);

    // Phase 4: Store the prep in memory for later reference
    await ctx.executeTool?.('memory_add', {
      content: `Meeting prep for "${request.topic}": ${prep.summary}`,
      metadata: { type: 'meeting_prep', topic: request.topic },
    });

    // Format output
    const output = formatMeetingPrep(prep, request);

    return {
      success: true,
      message: output,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to prepare meeting: ${(err as Error).message}`,
    };
  }
}

// ============================================================================
// REQUEST PARSING
// ============================================================================

async function parseMeetingRequest(ctx: SkillContext, message: string): Promise<MeetingRequest> {
  const parsePrompt = `
Analyze this meeting preparation request.

Message: "${message}"

Respond in JSON format:
{
  "topic": "Meeting topic/subject",
  "participants": ["participant1", "participant2"],
  "meetingType": "standup|one_on_one|team_meeting|client_meeting|presentation|brainstorm|review|planning|interview|general",
  "duration": 30,
  "objectives": ["objective 1", "objective 2"],
  "context": "Any additional context mentioned"
}

Rules:
- Extract as much information as possible from the message
- If participants not mentioned, leave empty array
- duration in minutes (default 30 if not specified)
- meetingType should be inferred from context
`;

  const response = await ctx.think(parsePrompt, { tier: 'flash' });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON parse failed');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      topic: parsed.topic || 'Meeting',
      participants: parsed.participants || [],
      meetingType: parsed.meetingType || 'general',
      duration: parsed.duration || 30,
      objectives: parsed.objectives || [],
      context: parsed.context || '',
    };
  } catch {
    return {
      topic: message.slice(0, 100),
      meetingType: 'general',
      duration: 30,
    };
  }
}

// ============================================================================
// CONTEXT GATHERING
// ============================================================================

async function gatherContext(ctx: SkillContext, request: MeetingRequest): Promise<ContextItem[]> {
  const contextItems: ContextItem[] = [];

  // Search memory for relevant context
  const searchQueries = [
    request.topic,
    ...request.participants || [],
    ...(request.objectives || []),
  ];

  for (const query of searchQueries.slice(0, 3)) {
    if (!query) continue;

    try {
      const result = await ctx.executeTool?.('memory_search', {
        query,
        limit: 3,
      });

      if (result?.success && result.data) {
        const memories = result.data as any[];
        for (const memory of memories) {
          contextItems.push({
            topic: query,
            details: memory.content || memory.text || '',
            source: 'memory',
            relevance: memory.similarity > 0.8 ? 'high' : memory.similarity > 0.6 ? 'medium' : 'low',
          });
        }
      }
    } catch {
      // Continue if memory search fails
    }
  }

  return contextItems;
}

// ============================================================================
// MEETING PREP GENERATION
// ============================================================================

async function generateMeetingPrep(
  ctx: SkillContext,
  request: MeetingRequest,
  relevantContext: ContextItem[]
): Promise<MeetingPrep> {
  const contextStr = relevantContext.length > 0
    ? `\nRELEVANT CONTEXT FROM MEMORY:\n${relevantContext.map(c => `- [${c.relevance}] ${c.topic}: ${c.details}`).join('\n')}`
    : '';

  const meetingTypeGuidance = getMeetingTypeGuidance(request.meetingType);

  const prompt = `
Prepare comprehensive meeting preparation materials.

MEETING INFO:
- Topic: ${request.topic}
- Type: ${request.meetingType}
- Participants: ${request.participants?.join(', ') || 'Not specified'}
- Duration: ${request.duration} minutes
- Objectives: ${request.objectives?.join(', ') || 'Not specified'}
- Additional Context: ${request.context || 'None'}
${contextStr}

MEETING TYPE GUIDANCE:
${meetingTypeGuidance}

OUTPUT FORMAT (JSON):
{
  "summary": "Brief overview of what this meeting is about and your preparation approach (2-3 sentences)",
  "keyContext": [
    {
      "topic": "Context topic",
      "details": "Important details to remember",
      "relevance": "high|medium|low"
    }
  ],
  "talkingPoints": [
    {
      "point": "Main talking point",
      "supporting": ["Supporting detail 1", "Supporting detail 2"],
      "priority": "must_mention|should_mention|if_time"
    }
  ],
  "questionsToAsk": ["Question 1", "Question 2", "Question 3"],
  "potentialConcerns": ["Potential concern or objection 1", "How to address it"],
  "suggestedAgenda": [
    {
      "item": "Agenda item",
      "duration": 5
    }
  ],
  "followUpActions": ["Suggested follow-up action 1", "Action 2"]
}

GUIDELINES:
- Be specific and actionable
- Prioritize talking points clearly
- Include smart questions that show preparation
- Anticipate concerns or objections
- Suggest a realistic agenda that fits the duration
- Include concrete follow-up actions
`;

  const response = await ctx.think(prompt, { tier: 'sonnet' });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Generation failed');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary || 'Meeting preparation ready.',
      keyContext: parsed.keyContext || [],
      talkingPoints: parsed.talkingPoints || [],
      questionsToAsk: parsed.questionsToAsk || [],
      potentialConcerns: parsed.potentialConcerns || [],
      suggestedAgenda: parsed.suggestedAgenda || [],
      followUpActions: parsed.followUpActions || [],
    };
  } catch {
    throw new Error('Could not generate meeting preparation');
  }
}

function getMeetingTypeGuidance(type: MeetingType): string {
  const guidance: Record<MeetingType, string> = {
    standup: 'Quick status update. Focus on: what was done, what will be done, blockers. Keep points brief.',
    one_on_one: 'Personal meeting. Include relationship-building elements, career topics, feedback opportunities.',
    team_meeting: 'Collaborative team session. Balance updates with discussion time. Include team-wide concerns.',
    client_meeting: 'External stakeholder. Professional tone, focus on value delivery, anticipate client questions.',
    presentation: 'You are presenting. Structure with clear intro, body, conclusion. Anticipate Q&A.',
    brainstorm: 'Creative session. Prepare seed ideas, create safe space for wild ideas, avoid judgment.',
    review: 'Evaluation meeting. Prepare data/metrics, constructive feedback, improvement suggestions.',
    planning: 'Planning session. Focus on goals, timelines, resources, dependencies, risk mitigation.',
    interview: 'Interview setting. Prepare questions, evaluation criteria, company/role information.',
    general: 'General meeting. Balanced approach with clear objectives and outcomes.',
  };

  return guidance[type];
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

function formatMeetingPrep(prep: MeetingPrep, request: MeetingRequest): string {
  const lines: string[] = [];

  lines.push(`## Meeting Preparation: ${request.topic}`);
  lines.push('');
  lines.push(`**Type:** ${request.meetingType} | **Duration:** ${request.duration} min`);
  if (request.participants && request.participants.length > 0) {
    lines.push(`**Participants:** ${request.participants.join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`### Summary`);
  lines.push(prep.summary);
  lines.push('');

  // Key Context
  if (prep.keyContext.length > 0) {
    lines.push('### Key Context');
    for (const ctx of prep.keyContext) {
      const relevanceIcon = ctx.relevance === 'high' ? '🔴' : ctx.relevance === 'medium' ? '🟡' : '🟢';
      lines.push(`${relevanceIcon} **${ctx.topic}:** ${ctx.details}`);
    }
    lines.push('');
  }

  // Talking Points
  if (prep.talkingPoints.length > 0) {
    lines.push('### Talking Points');
    for (const tp of prep.talkingPoints) {
      const priorityIcon = tp.priority === 'must_mention' ? '🔴' : tp.priority === 'should_mention' ? '🟡' : '🟢';
      lines.push(`${priorityIcon} **${tp.point}**`);
      for (const support of tp.supporting) {
        lines.push(`   - ${support}`);
      }
    }
    lines.push('');
  }

  // Questions to Ask
  if (prep.questionsToAsk.length > 0) {
    lines.push('### Questions to Ask');
    for (const q of prep.questionsToAsk) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }

  // Potential Concerns
  if (prep.potentialConcerns.length > 0) {
    lines.push('### Potential Concerns');
    for (const concern of prep.potentialConcerns) {
      lines.push(`- ${concern}`);
    }
    lines.push('');
  }

  // Suggested Agenda
  if (prep.suggestedAgenda && prep.suggestedAgenda.length > 0) {
    lines.push('### Suggested Agenda');
    let totalTime = 0;
    for (const item of prep.suggestedAgenda) {
      lines.push(`- ${item.item} (${item.duration} min)`);
      totalTime += item.duration;
    }
    lines.push(`_Total: ${totalTime} min_`);
    lines.push('');
  }

  // Follow-up Actions
  if (prep.followUpActions.length > 0) {
    lines.push('### Suggested Follow-ups');
    for (const action of prep.followUpActions) {
      lines.push(`- [ ] ${action}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Good luck with your meeting!_');

  return lines.join('\n');
}

export const tools = [];
