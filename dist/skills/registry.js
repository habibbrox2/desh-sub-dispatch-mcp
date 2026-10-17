const builtIn = [
    {
        id: "summarizer",
        name: "Summarizer",
        description: "LLM agent that summarizes text concisely.",
        tags: ["llm", "text"],
        agentConfig: {
            kind: "llm",
            provider: "openai",
            model: "gpt-4o-mini",
            systemPrompt: "You are a concise summarizer. Summarize the user input in 3-5 bullet points.",
            temperature: 0.3,
        },
    },
    {
        id: "coder",
        name: "Coder",
        description: "LLM agent that writes and reviews code.",
        tags: ["llm", "code"],
        agentConfig: {
            kind: "llm",
            provider: "openai",
            model: "gpt-4o",
            systemPrompt: "You are an expert software engineer. Write clean, well-tested code and explain tradeoffs.",
            temperature: 0.2,
        },
    },
    {
        id: "researcher",
        name: "Researcher",
        description: "LLM agent for research and analysis.",
        tags: ["llm", "research"],
        agentConfig: {
            kind: "llm",
            provider: "anthropic",
            model: "claude-3-5-sonnet-latest",
            systemPrompt: "You are a thorough researcher. Provide structured, cited analysis.",
            temperature: 0.4,
        },
    },
    {
        id: "shell-helper",
        name: "Shell Helper",
        description: "Process agent that runs shell commands via bash -c.",
        tags: ["process", "shell"],
        agentConfig: {
            kind: "process",
            command: "bash",
            args: ["-c"],
            shell: false,
        },
    },
    {
        id: "http-fetcher",
        name: "HTTP Fetcher",
        description: "HTTP agent template; configure url per use.",
        tags: ["http"],
        agentConfig: {
            kind: "http",
            url: "https://example.com",
            method: "GET",
        },
    },
    {
        id: "claude-coder",
        name: "Claude Coder",
        description: "Claude (Anthropic) coding agent.",
        tags: ["llm", "code", "claude"],
        agentConfig: {
            kind: "llm",
            provider: "anthropic",
            model: "claude-3-5-sonnet-latest",
            systemPrompt: "You are Claude, an expert software engineer. Write clean, tested code.",
            temperature: 0.2,
        },
    },
];
export class SkillRegistry {
    skills = new Map();
    constructor() {
        for (const s of builtIn)
            this.skills.set(s.id, s);
    }
    register(skill) {
        this.skills.set(skill.id, skill);
        return skill;
    }
    get(id) {
        return this.skills.get(id);
    }
    list(filter) {
        let out = [...this.skills.values()];
        if (filter?.tag)
            out = out.filter((s) => s.tags?.includes(filter.tag));
        return out;
    }
    unregister(id) {
        return this.skills.delete(id);
    }
}
//# sourceMappingURL=registry.js.map