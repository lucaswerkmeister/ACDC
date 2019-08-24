.PHONY: all clean check

all:
	npm run build

clean:
	$(RM) -r dist/

check:
	npm test
