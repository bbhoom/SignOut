import os
import json
import re
import string
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
from word_to_smplx import WordToSMPLX

app = Flask(__name__)

# --- Setup paths and load resources once ---
current_dir = os.path.dirname(os.path.abspath(__file__))
mapping_path = os.path.join(current_dir, "filtered_video_to_gloss.json")
dataset_dir = os.path.join(current_dir, "word-level-dataset-cpu")
output_dir = os.path.join(current_dir, "output")
os.makedirs(output_dir, exist_ok=True)

with open(mapping_path, "r") as f:
    gloss_map = json.load(f)
word_to_pkl = {v.lower(): k for k, v in gloss_map.items()}
dataset_words = set(word_to_pkl.keys())

animator = WordToSMPLX(model_path=os.path.join(current_dir, "models"))

# --- Helper: Extract YouTube video ID ---
def extract_video_id(url):
    regex = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, url)
    if match:
        return match.group(1)
    elif len(url) == 11:
        return url
    else:
        raise ValueError("Invalid YouTube URL or video ID.")

def transcript_to_words(transcript):
    # transcript: list of dicts with 'text'
    words = []
    for entry in transcript:
        for w in entry['text'].lower().split():
            w_clean = w.strip(string.punctuation)
            if w_clean in dataset_words and w_clean not in words:
                words.append(w_clean)
    return words

# --- Endpoint: Get transcript from YouTube ---
@app.route('/asl_from_youtube', methods=['POST'])
def asl_from_youtube():
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({'error': 'Missing YouTube URL'}), 400
    try:
        video_id = extract_video_id(url)
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable):
        return jsonify({'error': 'No transcript available for this video.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    words = transcript_to_words(transcript)
    if not words:
        return jsonify({'error': 'No recognizable ASL words found in transcript.'}), 400

    video_filename = f"{'_'.join(words)}_asl.mp4"
    video_path = os.path.join(output_dir, video_filename)
    if os.path.exists(video_path):
        return jsonify({'url': f"/output/{video_filename}"})

    # Load and concatenate pose data
    pose_data_sequences = []
    for word in words:
        pkl_file = os.path.join(dataset_dir, word_to_pkl[word])
        pose_data_dict = animator.load_pose_sequence(pkl_file)
        smplx_params_np = np.stack(pose_data_dict['smplx'])
        pose_data_sequences.append(smplx_params_np)
    all_params = np.vstack(pose_data_sequences)
    pose_data = animator.load_pose_sequence(os.path.join(dataset_dir, word_to_pkl[words[0]]))
    pose_data['smplx'] = [frame for frame in all_params]
    animator.render_animation(pose_data, save_path=video_path, fps=15)
    return jsonify({'url': f"/output/{video_filename}"})

# --- Serve generated videos ---
@app.route('/output/<path:filename>')
def download_file(filename):
    return send_from_directory(output_dir, filename)

@app.route('/')
def home():
    return "SMPLX ASL Backend is running. Use the /asl_from_youtube endpoint."

if __name__ == '__main__':
    app.run(port=5000, debug=True)