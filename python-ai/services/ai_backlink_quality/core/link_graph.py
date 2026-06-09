import networkx as nx

class TrustFlowCalculator:
    def compute_trust_flow(self, edges: list, trusted_seeds: list):
        """
        edges: لیستی از (source_domain, target_domain)
        trusted_seeds: دامنه‌های معتبر (مثلاً .gov, .edu)
        """
        G = nx.DiGraph()
        G.add_edges_from(edges)
        # TrustRank ساده‌شده: PageRank با بایاس به سمت trusted_seeds
        personalization = {node: 1.0 if node in trusted_seeds else 0.0 for node in G.nodes()}
        pr = nx.pagerank(G, personalization=personalization, alpha=0.85)
        return pr  # دیکشنری domain -> trust score