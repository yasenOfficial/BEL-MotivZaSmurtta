from pathlib import Path
import json
from flask import Flask, render_template, jsonify

app = Flask(__name__)

def load_json(filename: str):
    path = Path(__file__).with_name(filename)
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


data_model   = load_json("data.json")
theme_config = load_json("theme_config.json")


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/graph-data')
def get_graph_data():
    # Transform the data model into the graph format
    nodes = []
    links = []
    
    # Create nodes from works
    for work in data_model["works"]:
        # Find the author
        author = next((a for a in data_model["authors"] if a["id"] == work["author_id"]), None)
        # Find the period
        period = next((p for p in data_model["periods"] if p["id"] == work["period_id"]), None)
        
        node = {
            "id": work["id"],
            "title": work["title"],
            "year": work["year"],
            "author": author["name"] if author else "",
            "period": period["name"] if period else "",
            "description": work["summary_detailed"],
            "context": work["context_historical"],
            "subTheme": work["themes"][0] if work["themes"] else "philosophical",
            "themes": work["themes"],
            "summaries": {
                "minimal": work["summary_minimal"],
                "detailed": work["summary_detailed"]
            },
            "contexts": {
                "historical": work["context_historical"],
                "literary": work["context_literary"],
                "thematic": work["context_thematic"]
            },
            "animation": work["animation_data"],
            "resources": work.get("resources", [])
        }
        nodes.append(node)
    
    # Create links from connections
    for conn in data_model["connections"]:
        link = {
            "source": conn["from_work_id"],
            "target": conn["to_work_id"],
            "type": conn["conn_type"],
            "description": conn["description"]
        }
        links.append(link)
    
    return jsonify({
        "nodes": nodes,
        "links": links
    })

@app.route('/api/theme-config')
def get_theme_config():
    return jsonify(theme_config)

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=7000) 