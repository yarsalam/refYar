from sentence_transformers import SentenceTransformer
import numpy as np
import uuid

class ModelWrapper:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.name = 'all-MiniLM-L6-v2'
        self.version = 'v1'

    def get_embedding(self, text: str):
        return self.model.encode(text).tolist()

    def similarity(self, textA: str, textB: str):
        embA = self.model.encode(textA)
        embB = self.model.encode(textB)
        return float(np.dot(embA, embB) / (np.linalg.norm(embA) * np.linalg.norm(embB)))

    def start_retrain(self, mode="partial"):
        # اینجا می‌تونی retraining واقعی اضافه کنی
        job_id = str(uuid.uuid4())
        print(f"Retrain started [{mode}] with job_id={job_id}")
        return job_id
