# Grouped Validation

Grouped validation was requested and completed before model freeze wherever enough groups existed.

## Selected MRR

- Source grouped: {'mae': 55.85127749986155, 'rmse': 69.14209502535768, 'mape': 1376.876813879029, 'r2': -1.1042424001106137, 'median_ape': 436.1640004819195, 'max_ape': 12117.266099474533, 'validation_samples': 87, 'groups': 3, 'status': 'ok'}
- Material/electrode grouped: {'mae': 52.94636917368595, 'rmse': 66.05382427335424, 'mape': 1302.873325519933, 'r2': -0.9204660382983727, 'median_ape': 333.8464642736732, 'max_ape': 12117.266099474533, 'validation_samples': 87, 'groups': 5, 'status': 'ok'}
- Leave-one-material-out: {'mae': 55.85127749986155, 'rmse': 69.14209502535768, 'mape': 1376.876813879029, 'r2': -1.1042424001106137, 'median_ape': 436.1640004819195, 'max_ape': 12117.266099474533, 'validation_samples': 87, 'groups': 3, 'status': 'ok'}

## Selected TWR

- Source grouped: {'mae': 35.29140609163037, 'rmse': 61.89240780769647, 'mape': 889.8288148710054, 'r2': -1.6717256888470238, 'median_ape': 94.78450246623913, 'max_ape': 18068.24609108472, 'validation_samples': 72, 'groups': 3, 'status': 'ok'}
- Material/electrode grouped: {'mae': 43.241163616178156, 'rmse': 63.13601596236363, 'mape': 1230.804830115626, 'r2': -1.7801706622628433, 'median_ape': 570.1398573256686, 'max_ape': 18068.24609108472, 'validation_samples': 72, 'groups': 5, 'status': 'ok'}
- Leave-one-material-out: {'mae': 35.29140609163037, 'rmse': 61.89240780769647, 'mape': 889.8288148710054, 'r2': -1.6717256888470238, 'median_ape': 94.78450246623913, 'max_ape': 18068.24609108472, 'validation_samples': 72, 'groups': 3, 'status': 'ok'}

Interpretation: these are literature-only grouped diagnostics, not independent experimental validation. Negative source-group R2 means a model trained on one paper does not reliably transfer to the other source; the browser artifact is therefore restricted to exploratory, directly represented combinations.