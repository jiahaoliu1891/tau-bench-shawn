# TAU-BENCH Web REPL

A web-based interactive REPL (Read-Eval-Print Loop) for the TAU-BENCH environments. This application provides a user-friendly interface for interacting with both retail and airline customer service environments.

## Features

- **Interactive Web Interface**: Clean, modern UI for testing TAU-BENCH environments
- **Dual Environment Support**: Switch between retail and airline environments
- **Real-time Interaction**: Execute tools and send responses in real-time
- **Session Management**: Create and manage multiple sessions
- **Tool Explorer**: Browse and understand available tools
- **Action History**: Track all interactions in a session
- **Console Output**: Terminal-style output for all actions and observations

## Prerequisites

- Python 3.10 or higher (required for match/case statements)
- TAU-BENCH package installed in parent directory

## Installation

1. Navigate to the repl-web directory:
```bash
cd repl-web
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Ensure TAU-BENCH is properly installed:
```bash
cd ..
pip install -e .
```

## Usage

1. Start the Flask server:
```bash
python app.py
```

Or for production:
```bash
export FLASK_APP=app.py
export FLASK_ENV=production
flask run --host=0.0.0.0 --port=5000
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

3. Create a new session:
   - Select environment type (Retail or Airline)
   - Choose task split (Test, Train, Dev - note: Airline only supports Test)
   - Optionally specify a task index
   - Click "Create Session"

4. Interact with the environment:
   - **Send Responses**: Type messages to respond to the user
   - **Execute Tools**: Select and execute available tools with parameters
   - **Reset Environment**: Start a new task
   - **View Tools**: Browse all available tools and their parameters
   - **View History**: Review all actions taken in the session

## API Endpoints

The web app provides a RESTful API:

- `POST /api/session` - Create a new session
- `POST /api/session/<id>/reset` - Reset environment
- `POST /api/session/<id>/action` - Execute an action
- `GET /api/session/<id>/tools` - Get available tools
- `GET /api/session/<id>/state` - Get current state
- `GET /api/session/<id>/history` - Get action history
- `DELETE /api/session/<id>` - Delete session

## Environment Variables

- `SECRET_KEY`: Flask secret key for session management (default: auto-generated)
- `FLASK_ENV`: Set to 'production' for production deployment
- `FLASK_DEBUG`: Set to '0' to disable debug mode in production

## Project Structure

```
repl-web/
├── app.py              # Flask backend application
├── requirements.txt    # Python dependencies
├── README.md          # This file
├── static/
│   ├── style.css      # CSS styles
│   └── script.js      # Frontend JavaScript
└── templates/
    └── index.html     # Main HTML template
```

## Development

To run in development mode with auto-reload:
```bash
export FLASK_ENV=development
export FLASK_DEBUG=1
python app.py
```

## Troubleshooting

### "Module not found" error
Make sure TAU-BENCH is installed and the parent directory is in the Python path.

### "Python version" error
Ensure you're using Python 3.10 or higher:
```bash
python --version
```

### API Key Issues
Make sure you have the required API keys configured for the LLM providers (OpenAI, etc.) as environment variables.

## Security Notes

- Change the `SECRET_KEY` in production
- Use HTTPS in production deployments
- Consider adding authentication for production use
- Be cautious with API keys and credentials

## License

This tool is part of the TAU-BENCH project.