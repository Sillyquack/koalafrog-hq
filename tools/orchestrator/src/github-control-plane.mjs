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

  async fetchIssue() {
    const result = await this.appServer.callMcpTool({
      threadId: this.threadId,
      server: "codex_apps",
      tool: "github.fetch_issue",
      arguments: {
        issue_number: this.issueNumber,
        repository_full_name: this.repository,
      },
    })
    return unwrap(result, "Fetch issue").issue
  }

  async fetchTask() {
    const [issue, commentsResult] = await Promise.all([
      this.fetchIssue(),
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

  async updateComment(commentId, comment) {
    const result = await this.appServer.callMcpTool({
      threadId: this.threadId,
      server: "codex_apps",
      tool: "github.update_issue_comment",
      arguments: {
        repo_full_name: this.repository,
        comment_id: commentId,
        comment,
      },
    })
    return unwrap(result, "Update issue comment")
  }
}
