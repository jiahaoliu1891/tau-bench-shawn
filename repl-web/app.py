#!/usr/bin/env python3
"""
Web application for tau-bench REPL.
Provides a web interface for interacting with retail and airline environments.
"""

import json
import sys
import os
import uuid
from typing import Optional, Dict, Any
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS

# Add parent directory to path to import tau_bench
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tau_bench.envs.retail.env import MockRetailDomainEnv
from tau_bench.envs.airline.env import MockAirlineDomainEnv
from tau_bench.types import Action, RESPOND_ACTION_NAME

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'tau-bench-repl-secret-key-change-in-production')
CORS(app)

# Store environment instances per session
environments = {}


class WebEnvironment:
    """Web-friendly wrapper for tau-bench environments."""
    
    def __init__(self, env_type: str = "retail", task_split: str = "test", task_index: Optional[int] = None):
        self.env_type = env_type
        self.task_split = task_split
        
        if env_type == "retail":
            self.env = MockRetailDomainEnv(
                user_strategy="llm",
                user_model="gpt-4o",
                user_provider="openai",
                task_split=task_split,
                task_index=task_index
            )
        elif env_type == "airline":
            self.env = MockAirlineDomainEnv(
                user_strategy="llm",
                user_model="gpt-4o",
                user_provider="openai",
                task_split=task_split,
                task_index=task_index
            )
        else:
            raise ValueError(f"Unknown environment type: {env_type}")
        
        self.current_observation = None
        self.current_info = None
        self.done = False
        self.history = []
    
    def reset(self, task_index: Optional[int] = None):
        """Reset environment and return info."""
        response = self.env.reset(task_index=task_index)
        self.current_observation = response.observation
        self.current_info = response.info
        self.done = False
        self.history = []
        
        reset_info = {
            'observation': self.current_observation,
            'task': {
                'instruction': self.current_info.task.instruction,
                'user_id': self.current_info.task.user_id,
                'num_expected_actions': len(self.current_info.task.actions),
                'expected_outputs': self.current_info.task.outputs
            },
            'done': self.done
        }
        
        self.history.append({
            'type': 'reset',
            'data': reset_info
        })
        
        return reset_info
    
    def get_tools(self):
        """Get list of available tools."""
        tools = []
        for tool_name, tool_class in self.env.tools_map.items():
            tool_info = tool_class.get_info()
            func_info = tool_info["function"]
            
            parameters = []
            if "parameters" in func_info and "properties" in func_info["parameters"]:
                for param, details in func_info["parameters"]["properties"].items():
                    required = param in func_info["parameters"].get("required", [])
                    parameters.append({
                        'name': param,
                        'description': details.get('description', 'No description'),
                        'type': details.get('type', 'any'),
                        'required': required
                    })
            
            tools.append({
                'name': func_info['name'],
                'description': func_info['description'],
                'parameters': parameters
            })
        
        # Add respond action
        tools.append({
            'name': RESPOND_ACTION_NAME,
            'description': 'Send a response message to the user',
            'parameters': [
                {
                    'name': 'content',
                    'description': 'The message content to send',
                    'type': 'string',
                    'required': True
                }
            ]
        })
        
        return tools
    
    def execute_action(self, action_name: str, kwargs: Dict[str, Any]):
        """Execute an action and return result."""
        if self.done:
            return {
                'error': 'Environment is done. Please reset to continue.',
                'done': True
            }
        
        action = Action(name=action_name, kwargs=kwargs)
        response = self.env.step(action)
        
        self.current_observation = response.observation
        self.current_info = response.info
        self.done = response.done
        
        result = {
            'action': action_name,
            'parameters': kwargs,
            'observation': self.current_observation,
            'done': self.done,
            'reward': response.reward
        }
        
        if response.info.reward_info:
            result['reward_info'] = {
                'reward': response.info.reward_info.reward,
                'info': response.info.reward_info.info.dict() if response.info.reward_info.info else None
            }
        
        self.history.append({
            'type': 'action',
            'data': result
        })
        
        return result
    
    def get_state(self):
        """Get current environment state."""
        return {
            'env_type': self.env_type,
            'task_split': self.task_split,
            'done': self.done,
            'current_observation': self.current_observation,
            'task': {
                'instruction': self.current_info.task.instruction if self.current_info else None,
                'user_id': self.current_info.task.user_id if self.current_info else None,
            } if self.current_info else None,
            'history_length': len(self.history)
        }


@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')


@app.route('/api/session', methods=['POST'])
def create_session():
    """Create a new session with an environment."""
    data = request.json
    env_type = data.get('env_type', 'retail')
    task_split = data.get('task_split', 'test')
    task_index = data.get('task_index')
    
    # Validate parameters
    if env_type == 'airline' and task_split != 'test':
        return jsonify({'error': 'Airline environment only supports test split'}), 400
        
    try:
        session_id = str(uuid.uuid4())
        env = WebEnvironment(env_type, task_split, task_index)
        environments[session_id] = env
        
        return jsonify({
            'session_id': session_id,
            'env_type': env_type,
            'task_split': task_split,
            'tools': env.get_tools()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>/reset', methods=['POST'])
def reset_environment(session_id):
    """Reset the environment."""
    if session_id not in environments:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json or {}
    task_index = data.get('task_index')
    
    try:
        env = environments[session_id]
        reset_info = env.reset(task_index)
        return jsonify(reset_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>/action', methods=['POST'])
def execute_action(session_id):
    """Execute an action in the environment."""
    if session_id not in environments:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    action_name = data.get('action')
    parameters = data.get('parameters', {})
    
    if not action_name:
        return jsonify({'error': 'Action name required'}), 400
    
    try:
        env = environments[session_id]
        result = env.execute_action(action_name, parameters)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>/tools', methods=['GET'])
def get_tools(session_id):
    """Get available tools for the environment."""
    if session_id not in environments:
        return jsonify({'error': 'Session not found'}), 404
    
    try:
        env = environments[session_id]
        return jsonify({'tools': env.get_tools()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>/state', methods=['GET'])
def get_state(session_id):
    """Get current environment state."""
    if session_id not in environments:
        return jsonify({'error': 'Session not found'}), 404
    
    try:
        env = environments[session_id]
        return jsonify(env.get_state())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>/history', methods=['GET'])
def get_history(session_id):
    """Get action history."""
    if session_id not in environments:
        return jsonify({'error': 'Session not found'}), 404
    
    try:
        env = environments[session_id]
        return jsonify({'history': env.history})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a session."""
    if session_id in environments:
        del environments[session_id]
        return jsonify({'message': 'Session deleted'})
    return jsonify({'error': 'Session not found'}), 404


if __name__ == '__main__':
    app.run(debug=True, port=5000)