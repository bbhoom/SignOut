import streamlit as st
import os
import json
import subprocess
from word_to_smplx import WordToSMPLX
import imageio
import numpy as np
import tempfile

# --- Pose Blending Function ---
def blend_pose_sequences(seq_a, seq_b, n_blend=5):
    # seq_a, seq_b: [N, D] numpy arrays of SMPL-X parameters
    if n_blend == 0 or len(seq_a) < n_blend or len(seq_b) < n_blend:
        return np.vstack([seq_a, seq_b])
    
    blended_part = []
    for i in range(n_blend):
        alpha = (i + 1) / (n_blend + 1)  # Alpha from near 0 to near 1
        # Linear interpolation for all 156 parameters
        current_blend = (1 - alpha) * seq_a[-n_blend + i, :] + alpha * seq_b[i, :]
        blended_part.append(current_blend)
    
    if not blended_part: # Should not happen if n_blend > 0 and sequences are long enough
        return np.vstack([seq_a, seq_b])
        
    blended_part_np = np.array(blended_part)
    
    # Concatenate: part of A, blended part, part of B
    return np.vstack([seq_a[:-n_blend, :], blended_part_np, seq_b[n_blend:, :]])

st.set_page_config(page_title="SMPL-X Animation Demo", layout="centered")
st.title("SMPL-X Word Animation")

# --- Configuration and Setup ---
@st.cache_resource # Cache the animator resource
def get_animator(model_base_path):
    return WordToSMPLX(model_path=model_base_path)

current_dir = os.path.dirname(os.path.abspath(__file__))
mapping_path = os.path.join(current_dir, "filtered_video_to_gloss.json")
dataset_dir = os.path.join(current_dir, "word-level-dataset-cpu")
output_dir = os.path.join(current_dir, "output")
models_base_dir = os.path.join(current_dir, "models") # Path to "models" directory
os.makedirs(output_dir, exist_ok=True)

with open(mapping_path, "r") as f:
    gloss_map = json.load(f)
word_to_pkl = {v.lower(): k for k, v in gloss_map.items()}
all_words = sorted(word_to_pkl.keys())

animator = get_animator(models_base_dir)

# --- UI Elements ---
st.markdown("### Select Word(s) for Animation")
selected_words = st.multiselect(
    "Choose one or more words from the dataset:", 
    all_words,
    help="Animations will be played in the order of selection if multiple words are chosen."
)

if 'video_path_to_display' not in st.session_state:
    st.session_state.video_path_to_display = None
if 'video_header' not in st.session_state:
    st.session_state.video_header = ""

if st.button("✨ Generate Animation", type="primary"):
    if not selected_words:
        st.warning("Please select at least one word to animate.")
        st.session_state.video_path_to_display = None
    else:
        st.session_state.video_path_to_display = None
        with st.spinner(f"Generating animation for {', '.join(selected_words)}... This might take a moment."):
            pose_data_sequences = []
            for word in selected_words:
                pkl_file = os.path.join(dataset_dir, word_to_pkl[word])
                try:
                    pose_data_dict = animator.load_pose_sequence(pkl_file)
                    smplx_params_np = np.stack(pose_data_dict['smplx'])
                    pose_data_sequences.append(smplx_params_np)
                except Exception as e:
                    st.error(f"Error loading pose data for '{word}': {e}")
                    pose_data_sequences = []
                    break
            if pose_data_sequences:
                if len(selected_words) == 1:
                    video_filename = f"{selected_words[0]}_animation.mp4"
                    video_path = os.path.join(output_dir, video_filename)
                    if not os.path.exists(video_path):
                        pose_data = animator.load_pose_sequence(os.path.join(dataset_dir, word_to_pkl[selected_words[0]]))
                        animator.render_animation(pose_data, save_path=video_path, fps=15)
                    st.session_state.video_path_to_display = video_path
                    st.session_state.video_header = f"Animation for: {selected_words[0]}"
                else:
                    # Concatenate videos in memory using imageio and tempfile
                    all_frames = []
                    for word in selected_words:
                        video_filename = f"{word}_animation.mp4"
                        video_path = os.path.join(output_dir, video_filename)
                        if not os.path.exists(video_path):
                            pose_data = animator.load_pose_sequence(os.path.join(dataset_dir, word_to_pkl[word]))
                            animator.render_animation(pose_data, save_path=video_path, fps=15)
                        if os.path.exists(video_path):
                            reader = imageio.get_reader(video_path)
                            all_frames.extend([frame for frame in reader])
                            reader.close()
                        else:
                            st.error(f"Video for '{word}' could not be found or rendered.")
                    if all_frames:
                        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmpfile:
                            imageio.mimsave(tmpfile.name, all_frames, fps=15)
                            st.session_state.video_path_to_display = tmpfile.name
                            st.session_state.video_header = f"Combined Animation: {', '.join(selected_words)}"
                    else:
                        st.session_state.video_path_to_display = None
                        st.session_state.video_header = ""

# Video display logic
video_path = st.session_state.video_path_to_display
if video_path and os.path.exists(video_path):
    st.markdown(f"### {st.session_state.video_header}")
    st.video(video_path)
    with open(video_path, "rb") as file:
        st.download_button(
            label="Download Video",
            data=file,
            file_name=os.path.basename(video_path),
            mime="video/mp4"
        )
    if st.button("Clear Output"):
        st.session_state.video_path_to_display = None
        st.session_state.video_header = ""
        st.experimental_rerun()
else:
    if video_path:  # Only show error if a path was set
        st.error(f"Video file not found or could not be opened: {video_path}")

st.markdown("---")
st.markdown("**Instructions:**\
1. Select one or more words from the list.\
2. Click '✨ Generate Animation'.\
3. Watch the animation. If multiple words are selected, they will be concatenated and played as a single video.\
4. You can download the generated video or clear the output.") 