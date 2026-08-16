function unwrap(result, operation) {
  if (!result || result.isError) {
    throw new Error(`${operation} failed through the connected GitHub app`)
  }
  return result.structuredContent ?? {}
}

export class GithubControlPlane {
  constructor({ appServer, threadId, repository, issueNumber }) {
    this.appServer = appServer
    this.threadId = threadId
    this.repository = repository
    this.issueNumber = issueNumber
  }

  async fetchTask() {
    const [issueResult, commentsResult] = await Promise.all([
      this.appServer.callMcpTool({
        threadId: this.threadId,
        server: "codex_apps",
        tool: "github.fetch_issue",
        arguments: {
          issue_number: this.issueNumber,
          repository_full_name: this.repository,
        },
      }),
      this.appServer.callMcpTool({
        threadId: this.threadId,
        server: "codex_apps",
        tool: "github.fetch_issue_comments",
        arguments: {
          issue_number: this.issueNumber,
          repo_full_name: this.repository,
        },
      }),
    ])

    const issue = unwrap(issueResult, "Fetch issue").issue
    const comments = unwrap(commentsResult, "Fetch issue comments").comments ?? []
    return { issue, comments }
  }

  async postComment(comment) {
    const result = await this.appServer.callMcpTool({
      threadId: this.threadId,
      server: "codex_apps",
      tool: "github.add_comment_to_issue",
      arguments: {
        repo_full_name: this.repository,
        pr_number: this.issueNumber,
        comment,
      },
    })
    return unwrap(result, "Post issue comment")
  }
}
