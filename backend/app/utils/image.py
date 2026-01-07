import os
import uuid
from fastapi import UploadFile
from PIL import Image

def save_upload_file(upload_file: UploadFile, destination_dir: str) -> str:
    """
    Saves an uploaded image to a local directory with a unique name.
    Returns the path to the saved file.
    """
    # 1. Siguraduhing existing ang folder
    if not os.path.exists(destination_dir):
        os.makedirs(destination_dir)

    # 2. Gumawa ng unique filename para hindi mag-overwrite
    file_extension = os.path.splitext(upload_file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(destination_dir, unique_filename)

    # 3. I-save ang file
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())

    return file_path