// TAU-BENCH Web REPL JavaScript

let currentSession = null;
let availableTools = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateTaskSplitOptions();
});

// Setup all event listeners
function setupEventListeners() {
    // Session controls
    document.getElementById('create-session-btn').addEventListener('click', createSession);
    document.getElementById('new-session-btn').addEventListener('click', showSetupPanel);
    
    // Environment controls
    document.getElementById('reset-btn').addEventListener('click', resetEnvironment);
    document.getElementById('tools-btn').addEventListener('click', showToolsModal);
    document.getElementById('history-btn').addEventListener('click', showHistoryModal);
    
    // Input type selector
    document.querySelectorAll('input[name="input-type"]').forEach(radio => {
        radio.addEventListener('change', toggleInputType);
    });
    
    // Action buttons
    document.getElementById('send-response-btn').addEventListener('click', sendResponse);
    document.getElementById('execute-tool-btn').addEventListener('click', executeTool);
    
    // Environment type change
    document.getElementById('env-type').addEventListener('change', updateTaskSplitOptions);
    
    // Tool selector change
    document.getElementById('tool-select').addEventListener('change', updateToolParams);
}

// Update task split options based on environment type
function updateTaskSplitOptions() {
    const envType = document.getElementById('env-type').value;
    const taskSplit = document.getElementById('task-split');
    
    if (envType === 'airline') {
        // Airline only supports test
        taskSplit.innerHTML = '<option value="test">Test</option>';
    } else {
        // Retail supports all splits
        taskSplit.innerHTML = `
            <option value="test">Test</option>
            <option value="train">Train</option>
            <option value="dev">Dev</option>
        `;
    }
}

// Create a new session
async function createSession() {
    const envType = document.getElementById('env-type').value;
    const taskSplit = document.getElementById('task-split').value;
    const taskIndexInput = document.getElementById('task-index').value;
    const taskIndex = taskIndexInput ? parseInt(taskIndexInput) : null;
    
    try {
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                env_type: envType,
                task_split: taskSplit,
                task_index: taskIndex
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create session');
        }
        
        const data = await response.json();
        currentSession = data.session_id;
        availableTools = data.tools;
        
        // Update UI
        document.getElementById('session-info').textContent = 
            `Session: ${envType.toUpperCase()} - ${taskSplit}`;
        
        // Populate tools dropdown
        populateToolsDropdown();
        
        // Show REPL panel and hide setup panel
        document.getElementById('setup-panel').classList.add('hidden');
        document.getElementById('repl-panel').classList.remove('hidden');
        
        // Clear console
        document.getElementById('console-output').innerHTML = '';
        addConsoleEntry('system', `Session created: ${currentSession}`);
        
        // Auto-reset environment
        await resetEnvironment();
        
    } catch (error) {
        alert(`Error creating session: ${error.message}`);
    }
}

// Reset the environment
async function resetEnvironment() {
    if (!currentSession) {
        alert('No active session');
        return;
    }
    
    const taskIndexInput = prompt('Enter task index (leave empty for random):');
    const taskIndex = taskIndexInput ? parseInt(taskIndexInput) : null;
    
    try {
        const response = await fetch(`/api/session/${currentSession}/reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ task_index: taskIndex })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reset environment');
        }
        
        const data = await response.json();
        
        // Update task info
        updateTaskInfo(data.task);
        
        // Add to console
        addConsoleEntry('system', '=== Environment Reset ===');
        addConsoleEntry('system', `Task: ${data.task.instruction}`);
        addConsoleEntry('system', `User ID: ${data.task.user_id}`);
        addConsoleEntry('observation', `Initial observation:\n${data.observation}`);
        
    } catch (error) {
        addConsoleEntry('error', `Error: ${error.message}`);
    }
}

// Send a response to the user
async function sendResponse() {
    if (!currentSession) {
        alert('No active session');
        return;
    }
    
    const content = document.getElementById('response-text').value.trim();
    
    if (!content) {
        alert('Please enter a response');
        return;
    }
    
    try {
        const response = await fetch(`/api/session/${currentSession}/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'respond',
                parameters: { content }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send response');
        }
        
        const data = await response.json();
        
        // Add to console
        addConsoleEntry('action', `RESPOND: ${content}`);
        addConsoleEntry('observation', `Observation:\n${data.observation}`);
        
        if (data.done) {
            addConsoleEntry('system', `=== Episode Complete ===\nReward: ${data.reward}`);
            if (data.reward_info) {
                addConsoleEntry('system', `Reward Info: ${JSON.stringify(data.reward_info, null, 2)}`);
            }
        }
        
        // Clear input
        document.getElementById('response-text').value = '';
        
    } catch (error) {
        addConsoleEntry('error', `Error: ${error.message}`);
    }
}

// Execute a tool
async function executeTool() {
    if (!currentSession) {
        alert('No active session');
        return;
    }
    
    const toolName = document.getElementById('tool-select').value;
    
    if (!toolName) {
        alert('Please select a tool');
        return;
    }
    
    // Collect parameters
    const params = {};
    const paramInputs = document.querySelectorAll('#tool-params input');
    
    paramInputs.forEach(input => {
        const paramName = input.dataset.param;
        const value = input.value.trim();
        
        if (value) {
            // Try to parse as JSON if it looks like JSON
            if ((value.startsWith('{') && value.endsWith('}')) || 
                (value.startsWith('[') && value.endsWith(']'))) {
                try {
                    params[paramName] = JSON.parse(value);
                } catch {
                    params[paramName] = value;
                }
            } else if (!isNaN(value)) {
                params[paramName] = Number(value);
            } else if (value === 'true' || value === 'false') {
                params[paramName] = value === 'true';
            } else {
                params[paramName] = value;
            }
        }
    });
    
    try {
        const response = await fetch(`/api/session/${currentSession}/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: toolName,
                parameters: params
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to execute tool');
        }
        
        const data = await response.json();
        
        // Add to console
        addConsoleEntry('action', `TOOL: ${toolName}\nParams: ${JSON.stringify(params, null, 2)}`);
        addConsoleEntry('observation', `Observation:\n${data.observation}`);
        
        if (data.done) {
            addConsoleEntry('system', `=== Episode Complete ===\nReward: ${data.reward}`);
            if (data.reward_info) {
                addConsoleEntry('system', `Reward Info: ${JSON.stringify(data.reward_info, null, 2)}`);
            }
        }
        
        // Clear inputs
        paramInputs.forEach(input => input.value = '');
        
    } catch (error) {
        addConsoleEntry('error', `Error: ${error.message}`);
    }
}

// Toggle between response and tool input
function toggleInputType() {
    const inputType = document.querySelector('input[name="input-type"]:checked').value;
    
    if (inputType === 'respond') {
        document.getElementById('respond-input').classList.remove('hidden');
        document.getElementById('tool-input').classList.add('hidden');
    } else {
        document.getElementById('respond-input').classList.add('hidden');
        document.getElementById('tool-input').classList.remove('hidden');
    }
}

// Populate tools dropdown
function populateToolsDropdown() {
    const select = document.getElementById('tool-select');
    select.innerHTML = '<option value="">-- Select a tool --</option>';
    
    availableTools.forEach(tool => {
        if (tool.name !== 'respond') {  // Skip respond as it has its own input
            const option = document.createElement('option');
            option.value = tool.name;
            option.textContent = tool.name;
            select.appendChild(option);
        }
    });
}

// Update tool parameters form
function updateToolParams() {
    const toolName = document.getElementById('tool-select').value;
    const paramsDiv = document.getElementById('tool-params');
    
    if (!toolName) {
        paramsDiv.innerHTML = '';
        return;
    }
    
    const tool = availableTools.find(t => t.name === toolName);
    
    if (!tool || !tool.parameters) {
        paramsDiv.innerHTML = '<p>No parameters required</p>';
        return;
    }
    
    let html = '';
    tool.parameters.forEach(param => {
        html += `
            <div class="param-input">
                <label>
                    ${param.name}
                    ${param.required ? '<span class="param-required">*</span>' : ''}
                    <small>(${param.type})</small>
                </label>
                <input type="text" 
                       data-param="${param.name}" 
                       placeholder="${param.description}"
                       ${param.required ? 'required' : ''}>
            </div>
        `;
    });
    
    paramsDiv.innerHTML = html;
}

// Update task information display
function updateTaskInfo(task) {
    const taskInfoDiv = document.getElementById('task-info');
    
    taskInfoDiv.innerHTML = `
        <h3>Current Task</h3>
        <p><strong>Instruction:</strong> ${task.instruction}</p>
        <p><strong>User ID:</strong> ${task.user_id}</p>
        <p><strong>Expected Actions:</strong> ${task.num_expected_actions}</p>
        ${task.expected_outputs && task.expected_outputs.length > 0 ? 
            `<p><strong>Expected Outputs:</strong> ${task.expected_outputs.join(', ')}</p>` : ''}
    `;
}

// Add entry to console
function addConsoleEntry(type, content) {
    const output = document.getElementById('console-output');
    const entry = document.createElement('div');
    entry.className = `console-entry ${type}`;
    entry.textContent = content;
    output.appendChild(entry);
    
    // Scroll to bottom
    const console = document.getElementById('console');
    console.scrollTop = console.scrollHeight;
}

// Show setup panel
function showSetupPanel() {
    document.getElementById('setup-panel').classList.remove('hidden');
    document.getElementById('repl-panel').classList.add('hidden');
    currentSession = null;
    document.getElementById('session-info').textContent = '';
}

// Show tools modal
async function showToolsModal() {
    const modal = document.getElementById('tools-modal');
    const toolsList = document.getElementById('tools-list');
    
    let html = '';
    availableTools.forEach(tool => {
        html += `
            <div class="tool-item">
                <h3>${tool.name}</h3>
                <p>${tool.description}</p>
                ${tool.parameters && tool.parameters.length > 0 ? `
                    <div class="tool-params-list">
                        <strong>Parameters:</strong>
                        ${tool.parameters.map(param => `
                            <div class="tool-param">
                                <span class="param-name">${param.name}</span>
                                ${param.required ? ' (required)' : ' (optional)'}
                                - ${param.description}
                            </div>
                        `).join('')}
                    </div>
                ` : '<p><em>No parameters required</em></p>'}
            </div>
        `;
    });
    
    toolsList.innerHTML = html;
    modal.classList.remove('hidden');
}

// Show history modal
async function showHistoryModal() {
    if (!currentSession) {
        alert('No active session');
        return;
    }
    
    try {
        const response = await fetch(`/api/session/${currentSession}/history`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch history');
        }
        
        const data = await response.json();
        const modal = document.getElementById('history-modal');
        const historyList = document.getElementById('history-list');
        
        if (!data.history || data.history.length === 0) {
            historyList.innerHTML = '<p>No history available</p>';
        } else {
            let html = '';
            data.history.forEach((item, index) => {
                const timestamp = new Date().toLocaleTimeString();
                html += `
                    <div class="history-item ${item.type}">
                        <div class="history-timestamp">#${index + 1} - ${item.type.toUpperCase()}</div>
                        <div class="history-content">
                            <pre>${JSON.stringify(item.data, null, 2)}</pre>
                        </div>
                    </div>
                `;
            });
            historyList.innerHTML = html;
        }
        
        modal.classList.remove('hidden');
        
    } catch (error) {
        alert(`Error fetching history: ${error.message}`);
    }
}

// Close tools modal
function closeToolsModal() {
    document.getElementById('tools-modal').classList.add('hidden');
}

// Close history modal
function closeHistoryModal() {
    document.getElementById('history-modal').classList.add('hidden');
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.add('hidden');
    }
}