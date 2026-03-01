 # Design: Parallel Tool Execution & Subagent Delegation
 
 ## 1. Objective
 Enhance the `QAAgent` with the ability to:
 1. Execute independent tool calls requested by the model in parallel.
 2. Delegate specialized tasks to transient "Subagents" for better role isolation and cleaner context.
 
 ## 2. Parallel Tool Execution
 
 ### 2.1 logic
 The sequential `for` loop in `QAAgent.chat` will be replaced with a concurrent mapping using `Promise.all`.
 
 ### 2.2 Execution Flow
 1. Model returns multiple `functionCalls`.
 2. Agent yields `tool_call` events for all calls immediately.
 3. All tool functions are invoked simultaneously.
 4. As each tool completes, a `tool_result` event is yielded.
 5. The full set of results is appended to `this.history` once all tools in the batch are finished.
 
 ## 3. Subagent Delegation
 
 ### 3.1 Specialized Tools
 A new tool `delegateTask` will be added to the main agent's repertoire.
 
 ### 3.2 Roles
 - **gitlab_specialist**: Access to GitLab issue and project management tools.
 - **test_specialist**: Access to recorded test listing and execution tools.
 
 ### 3.3 Delegation Mechanics
 - **Fresh Context**: Subagents are initialized with **no history** from the main agent. They only see the `task` instruction.
 - **Transient Lifetime**: Subagents are created on-demand and destroyed after the delegated task is completed.
 - **Result Handling**: The final summary output of the subagent is returned as the tool result to the main agent.
 
 ## 4. Technical Constraints
 - **Token Management**: `trimHistory` will be called after each parallel batch and delegation result.
 - **Error Handling**: Failure in one parallel tool call will not abort others; individual results will contain the error message.
